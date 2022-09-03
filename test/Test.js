// This is an exmaple test file. Hardhat will run every *.js file in `test/`,
// so feel free to add new ones.

// Hardhat tests are normally written with Mocha and Chai.

// We import Chai to use its asserting functions here.
const { expect } = require("chai");
const { BigNumber, Signer, utils } = require("ethers");
const hre = require('hardhat')
// const { signTypedData } = require('eth-sig-util')
const ethUtil = require('ethereumjs-util');
const ethAbi = require('ethereumjs-abi');

async function getLatestBlock(provider) {
  return provider.send('eth_getBlockByNumber', ['latest', true])
}

async function getLatestTimestamp(provider) {
  return parseInt((await getLatestBlock(provider)).timestamp.toString())
}

const TYPED_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    types: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {type: 'string'},
            type: {type: 'string'},
          },
          required: ['name', 'type'],
        },
      },
    },
    primaryType: {type: 'string'},
    domain: {type: 'object'},
    message: {type: 'object'},
  },
  required: ['types', 'primaryType', 'domain', 'message'],
}

sanitizeData = function (data) {
  const sanitizedData = {}
  for (const key in TYPED_MESSAGE_SCHEMA.properties) {
    data[key] && (sanitizedData[key] = data[key])
  }
  if (sanitizedData.types) {
    sanitizedData.types = Object.assign({ EIP712Domain: [] }, sanitizedData.types)
  }
  return sanitizedData

}

findTypeDependencies = function (primaryType, types, results = []) {
  primaryType = primaryType.match(/^\w*/)[0]
  if (results.includes(primaryType) || types[primaryType] === undefined) { return results }
  results.push(primaryType)
  for (const field of types[primaryType]) {
    for (const dep of findTypeDependencies(field.type, types, results)) {
      !results.includes(dep) && results.push(dep)
    }
  }
  return results
}

encodeType = function (primaryType, types) {
  let result = ''
  let deps = findTypeDependencies(primaryType, types).filter(dep => dep !== primaryType)
  deps = [primaryType].concat(deps.sort())
  for (const type of deps) {
    const children = types[type]
    if (!children) {
      throw new Error('No type definition specified: ' + type)
    }
    result += type + '(' + types[type].map(({ name, type }) => type + ' ' + name).join(',') + ')'
  }
  return result
}

hashType = function (primaryType, types) {
  return utils.keccak256(utils.toUtf8Bytes(encodeType(primaryType, types)))
}

encodeData = function (primaryType, data, types, useV4 = true) {
  const encodedTypes = ['bytes32']
  const encodedValues = [hashType(primaryType, types)]

  if(useV4) {
    const encodeField = (name, type, value) => {
      if (types[type] !== undefined) {
        return ['bytes32', value == null ?
          '0x0000000000000000000000000000000000000000000000000000000000000000' :
          utils.keccak256(encodeData(type, value, types, useV4))]
      }

      if(value === undefined)
        throw new Error(`missing value for field ${name} of type ${type}`)

      if (type === 'bytes') {
        return ['bytes32', utils.keccak256(value)]
      }

      if (type === 'string') {
        // convert string to buffer - prevents ethUtil from interpreting strings like '0xabcd' as hex
        if (typeof value === 'string') {
          value = Buffer.from(value, 'utf8')
        }
        return ['bytes32', utils.keccak256(value)]
      }

      if (type.lastIndexOf(']') === type.length - 1) {
        const parsedType = type.slice(0, type.lastIndexOf('['))
        const typeValuePairs = value.map(item =>
          encodeField(name, parsedType, item))
        return ['bytes32', utils.keccak256(ethAbi.rawEncode(
          typeValuePairs.map(([type]) => type),
          typeValuePairs.map(([, value]) => value),
        ))]
      }

      return [type, value]
    }

    for (const field of types[primaryType]) {
      const [type, value] = encodeField(field.name, field.type, data[field.name])
      encodedTypes.push(type)
      encodedValues.push(value)
    }
  } else {
    for (const field of types[primaryType]) {
      let value = data[field.name]
      if (value !== undefined) {
        if (field.type === 'bytes') {
          encodedTypes.push('bytes32')
          value = utils.keccak256(value)
          encodedValues.push(value)
        } else if (field.type === 'string') {
          encodedTypes.push('bytes32')
          // convert string to buffer - prevents ethUtil from interpreting strings like '0xabcd' as hex
          if (typeof value === 'string') {
            value = Buffer.from(value, 'utf8')
          }
          value = utils.keccak256(value)
          encodedValues.push(value)
        } else if (types[field.type] !== undefined) {
          encodedTypes.push('bytes32')
          value = utils.keccak256(encodeData(field.type, value, types, useV4))
          encodedValues.push(value)
        } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
          throw new Error('Arrays currently unimplemented in encodeData')
        } else {
          encodedTypes.push(field.type)
          encodedValues.push(value)
        }
      }
    }
  }

  return ethAbi.rawEncode(encodedTypes, encodedValues)
}

hashStruct = function (primaryType, data, types, useV4 = true) {
  return utils.keccak256(encodeData(primaryType, data, types, useV4))
}

sign = function (typedData, useV4 = true) {
  const sanitizedData = sanitizeData(typedData)
  const parts = [Buffer.from('1901', 'hex')]
  parts.push(
    utils.arrayify(
      hashStruct('EIP712Domain', sanitizedData.domain, sanitizedData.types, useV4)
    )
  )
  if (sanitizedData.primaryType !== 'EIP712Domain') {
    parts.push(
      utils.arrayify(
        hashStruct(sanitizedData.primaryType, sanitizedData.message, sanitizedData.types, useV4)
      )
    )
  }
  return utils.keccak256(Buffer.concat(parts))
}

concatSig = function (v, r, s) {
  const rSig = ethUtil.fromSigned(r)
  const sSig = ethUtil.fromSigned(s)
  const vSig = ethUtil.bufferToInt(v)
  const rStr = utils.zeroPad(ethUtil.toUnsigned(rSig), 32)
  console.log('rStr : ', utils.hexlify(rStr))
  const sStr = utils.zeroPad(ethUtil.toUnsigned(sSig), 32)
  const vStr = ethUtil.intToHex(vSig)
  return utils.concat([rStr, sStr, vStr])
}

signTypedData = function (privateKey, msgParams) {
  const message = utils.arrayify(sign(msgParams.data, false))
  const sig = ethUtil.ecsign(message, utils.arrayify('0x'+privateKey))
  return sig
},

getSignature = async (
  verifyingContract, 
  maker,
  deadline,
  makersChoiceHash,
  takersChoicePlain,
  payoutToken
) => {
  const domain = {name:"SetTest",version:"1",chainId: await maker.getChainId(),verifyingContract}
  const types = {
    EIP712Domain: [
      {name:"name",type:"string"},
      {name:"version",type:"string"},
      {name:"chainId",type:"uint256"},
      {name:"verifyingContract",type:"address"}
    ],
    TakenBet: [
      {name:"maker",type:"address"},
      {name:"deadline", type:"uint256"},
      {name:"makersChoiceHash",type:"bytes32"},
      {name:"takersChoicePlain",type:"uint8"},
      {name:"payoutToken",type:"address"},
    ]
  };
  const message = {
    maker: maker.address,
    deadline,
    makersChoiceHash,
    takersChoicePlain,
    payoutToken,
  }
  const pk = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  const pkBuff = Buffer.from("ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", 'hex')
  return await signTypedData(
    pk, {
      data: {domain, types, message, primaryType: "TakenBet"},
      privateKey: pk,
      version: "V4"
    }, 
    'V4'
  )
}
describe("Token contract", function () {
  // Mocha has four functions that let you hook into the the test runner's
  // lifecyle. These are: `before`, `beforeEach`, `after`, `afterEach`.

  // They're very useful to setup the environment for tests, and to clean it
  // up after they run.

  // A common pattern is to declare some variables, and assign them in the
  // `before` and `beforeEach` callbacks.

  let rps;
  let usdc;
  let weth;
  let alice;
  let bob;
  let charlie;
  let provider;

  beforeEach(async function () {
    [alice, bob, charlie, ...addrs] = await hre.ethers.getSigners()
    provider = hre.ethers.provider

    const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
    rps = await RockPaperScissors.deploy();
    await rps.deployed();

    const Token = await ethers.getContractFactory("ERC20");
    usdc = await Token.deploy("USD Coin", "USDC");
    weth = await Token.deploy("Wrapped Ether", "WETH");
    await usdc.deployed();
    await weth.deployed();

    let r
    r = await usdc.mint(alice.address, BigNumber.from(10).pow(18).mul(100))
    r = await usdc.mint(bob.address, BigNumber.from(10).pow(18).mul(100))
    r = await usdc.mint(charlie.address, BigNumber.from(10).pow(18).mul(100))
    
    r = await usdc
      .approve(rps.address, BigNumber.from(10).pow(18).mul(100))
    await r.wait()
    r = await usdc.connect(bob)
      .approve(rps.address, BigNumber.from(10).pow(18).mul(100))
    await r.wait()
    r = await usdc.connect(charlie)
      .approve(rps.address, BigNumber.from(10).pow(18).mul(100))
    await r.wait()

    r = await weth
      .approve(rps.address, BigNumber.from(10).pow(18).mul(100))
    await r.wait()
    r = await weth.connect(bob)
      .approve(rps.address, BigNumber.from(10).pow(18).mul(100))
    await r.wait()
    r = await usdc.connect(charlie)
      .approve(rps.address, BigNumber.from(10).pow(18).mul(100))
    await r.wait()
  });

  // You can nest describe calls to create subsections.
  describe("Deployment", function () {
    // `it` is another Mocha function. This is the one you use to define your
    // tests. It receives the test name, and a callback function.

    // If the callback function is async, Mocha will `await` it.
    it.only("Should set the right owner", async function () {

      const salt = "0xb329ab3b6b29"
      const makersChoiceHash = await rps.getMyChoiceHash(1,salt)

      const milsec_deadline = Date.now() / 1000 + 1000;
      console.log(milsec_deadline, "milisec");
      const deadline = parseInt(String(milsec_deadline).slice(0, 10));
      console.log(deadline, "sec");

      const signature = await getSignature(
        rps.address,
        alice,
        deadline,
        makersChoiceHash,
        3,
        usdc.address
      )

      const { r, s, v } = signature
      console.log("r:", r);
      console.log("s:", s);
      console.log("v:", v);

      let res;
      res = await rps.connect(bob).take(v,r,s,alice.address,deadline,makersChoiceHash,3,usdc.address)
      await res.wait(1)
      
      res = await rps.reveal(1, salt)
      await res.wait(1)

      const bal = await usdc.balanceOf(alice.address)
      console.log(utils.formatUnits(bal,18))
      const allowance = await usdc.allowance(alice.address, rps.address)
      console.log(utils.formatUnits(allowance,18))
    });
  });
});