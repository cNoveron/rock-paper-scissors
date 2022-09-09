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
const _ = require('lodash');


async function getLatestBlock(provider) {
  return provider.send('eth_getBlockByNumber', ['latest', true])
}

async function getLatestTimestamp(provider) {
  return parseInt((await getLatestBlock(provider)).timestamp.toString())
}

function toAtomicUnits(n) {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
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
  const sStr = utils.zeroPad(ethUtil.toUnsigned(sSig), 32)
  const vStr = ethUtil.intToHex(vSig)
  return utils.concat([rStr, sStr, vStr])
}

signTypedData = function (privateKey, msgParams) {
  const message = utils.arrayify(sign(msgParams.data, false))
  const sig = ethUtil.ecsign(message, utils.arrayify('0x'+privateKey))
  return sig
},

getBetSig = async (
  verifyingContract, 
  maker,
  deadline,
  makersChoiceHash,
  takersChoicePlain,
  payoutToken
) => {
  const domain = { name:"SetTest", version:"1", chainId: await maker.getChainId(), verifyingContract }
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
  return await signTypedData(
    pk, {
      data: {domain, types, message, primaryType: "TakenBet"},
      privateKey: pk,
      version: "V4"
    }, 
    'V4'
  )
}

getSignature = async (
  name,
  verifyingContract,
  chainId,
  primaryType,
  customTypes,
  values,
  pk
) => {
  const domain = { name, version:"1", chainId, verifyingContract }
  const types = {
    EIP712Domain: [
      {name:"name",type:"string"},
      {name:"version",type:"string"},
      {name:"chainId",type:"uint256"},
      {name:"verifyingContract",type:"address"}
    ],
    [primaryType]: customTypes
  };
  const message = _.zipObject(types[primaryType].map((v) => v.name), values)
  // console.log('message:', message,'')
  return await signTypedData(
    pk, {
      data: {domain, types, message, primaryType},
      privateKey: pk,
      version: "V4"
    }, 
    'V4'
  )
}

let rps;
let usdc;
let weth;
let alice;
let bob;
let charlie;
let provider;

const salt = "0xb329ab3b6b29"

const getPk = (b) => 
  b === "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" 
  ? "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  : b === "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" 
    ? "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    : b === "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" 
      ? "5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
      : null


async function makeAndTake(maker, makersChoice, taker, takersChoice, salt) {
  const milsec_deadline = Date.now() + (2*24+1)*60*60*1000;
  const deadline =  parseInt(String(milsec_deadline).slice(0, 10));

  const makerPk = getPk(maker.address)
  const makersPermit = await getSignature(
    'USD Coin',
    usdc.address,
    await maker.getChainId(),
    'Permit',
    [
      {name:"owner",type:"address"},
      {name:"spender", type:"address"},
      {name:"value",type:"uint256"},
      {name:"nonce", type:"uint256"},
      {name:"deadline", type:"uint256"},
    ],
    [ 
      maker.address,
      rps.address,
      toAtomicUnits(20).toString(),
      (await usdc.nonces(maker.address)).toString(),
      deadline,
    ],
    makerPk,
  )

  const makersChoiceHash = await rps.connect(maker).getMyChoiceHash(makersChoice,salt)
  const makersBetSig = await getSignature(
    'RockPaperScissors',
    rps.address,
    await maker.getChainId(),
    'TakenBet',
    [
      {name:"maker",type:"address"},
      {name:"deadline", type:"uint256"},
      {name:"makersChoiceHash",type:"bytes32"},
      {name:"payoutToken",type:"address"},
    ],
    [ 
      maker.address,
      deadline,
      makersChoiceHash,
      usdc.address,
    ],
    makerPk,
  )
  
  const takersPermit = await getSignature(
    'USD Coin',
    usdc.address,
    await taker.getChainId(),
    'Permit',
    [
      {name:"owner",type:"address"},
      {name:"spender", type:"address"},
      {name:"value",type:"uint256"},
      {name:"nonce", type:"uint256"},
      {name:"deadline", type:"uint256"},
    ],
    [ 
      taker.address,
      rps.address,
      toAtomicUnits(20).toString(),
      (await usdc.nonces(taker.address)).toString(),
      deadline,
    ],
    getPk(taker.address),
  )

  const v = [takersPermit.v, makersPermit.v, makersBetSig.v]
  const r = [takersPermit.r, makersPermit.r, makersBetSig.r]
  const s = [takersPermit.s, makersPermit.s, makersBetSig.s]

  // const events = rps.interface
  // console.log(events)

  let res;
  res = await rps.connect(taker).take(v,r,s,
    maker.address, deadline, makersChoiceHash, takersChoice, usdc.address)
  await res.wait()

  const filter = await rps.filters.BetTaken(null, maker.address)
  const events = await rps.queryFilter(filter)

  res = await rps.connect(maker).reveal(events[0].args.betId, makersChoice, salt)
  await res.wait()
}

describe("Token contract", async function () {
  // Mocha has four functions that let you hook into the the test runner's
  // lifecyle. These are: `before`, `beforeEach`, `after`, `afterEach`.

  // They're very useful to setup the environment for tests, and to clean it
  // up after they run.

  // A common pattern is to declare some variables, and assign them in the
  // `before` and `beforeEach` callbacks.

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
    
  });



  describe("Alice chooses rock and Bob choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 1, bob, 3, salt)
    });

    it("Alice should have 120 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(120));
    })

    it("Bob should have 80 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(80));
    })
  });

  describe("Alice chooses rock and Bob choses paper", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 1, bob, 2, salt)
    });

    it("Alice should have 80 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(80));
    })

    it("Bob should have 120 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(120));
    })
  });

  describe("Alice chooses rock and Bob choses rock", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 1, bob, 1, salt)
    });

    it("Alice should have 100 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(100));
    })

    it("Bob should have 100 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(100));
    })
  });

  describe("Alice chooses paper and Bob choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 2, bob, 3, salt)
    });

    it("Alice should have 100 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(80));
    })

    it("Bob should have 100 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(120));
    })
  });



  describe("Alice chooses rock and Charlie choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 1, charlie, 3, salt)
    });

    it("Alice should have 120 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(120));
    })

    it("Charlie should have 80 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(80));
    })
  });

  describe("Alice chooses rock and Charlie choses paper", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 1, charlie, 2, salt)
    });

    it("Alice should have 80 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(80));
    })

    it("Charlie should have 120 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(120));
    })
  });

  describe("Alice chooses rock and Charlie choses rock", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 1, charlie, 1, salt)
    });

    it("Alice should have 100 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(100));
    })

    it("Charlie should have 100 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(100));
    })
  });

  describe("Alice chooses paper and Charlie choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(alice, 2, charlie, 3, salt)
    });

    it("Alice should have 100 USDC in her wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(80));
    })

    it("Charlie should have 100 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(120));
    })
  });



  describe("Bob chooses rock and Alice choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 1, alice, 3, salt)
    });

    it("Bob should have 120 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(120));
    })

    it("Alice should have 80 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(80));
    })
  });

  describe("Bob chooses rock and Alice choses paper", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 1, alice, 2, salt)
    });

    it("Bob should have 80 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(80));
    })

    it("Alice should have 120 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(120));
    })
  });

  describe("Bob chooses rock and Alice choses rock", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 1, alice, 1, salt)
    });

    it("Bob should have 100 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(100));
    })

    it("Alice should have 100 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(100));
    })
  });

  describe("Bob chooses paper and Alice choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 2, alice, 3, salt)
    });

    it("Bob should have 100 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(80));
    })

    it("Alice should have 100 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(120));
    })
  });



  describe("Bob chooses rock and Charlie choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 1, charlie, 3, salt)
    });

    it("Bob should have 120 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(120));
    })

    it("Charlie should have 80 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(80));
    })
  });

  describe("Bob chooses rock and Charlie choses paper", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 1, charlie, 2, salt)
    });

    it("Bob should have 80 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(80));
    })

    it("Charlie should have 120 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(120));
    })
  });

  describe("Bob chooses rock and Charlie choses rock", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 1, charlie, 1, salt)
    });

    it("Bob should have 100 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(100));
    })

    it("Charlie should have 100 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(100));
    })
  });

  describe("Bob chooses paper and Charlie choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(bob, 2, charlie, 3, salt)
    });

    it("Bob should have 100 USDC in her wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(80));
    })

    it("Charlie should have 100 USDC in his wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(120));
    })
  });



  describe("Charlie chooses rock and Alice choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 1, alice, 3, salt)
    });

    it("Charlie should have 120 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(120));
    })

    it("Alice should have 80 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(80));
    })
  });

  describe("Charlie chooses rock and Alice choses paper", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 1, alice, 2, salt)
    });

    it("Charlie should have 80 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(80));
    })

    it("Alice should have 120 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(120));
    })
  });

  describe("Charlie chooses rock and Alice choses rock", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 1, alice, 1, salt)
    });

    it("Charlie should have 100 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(100));
    })

    it("Alice should have 100 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(100));
    })
  });

  describe("Charlie chooses paper and Alice choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 2, alice, 3, salt)
    });

    it("Charlie should have 100 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(80));
    })

    it("Alice should have 100 USDC in his wallet", async function(){
      const aliceBal = await usdc.balanceOf(alice.address)
      expect(aliceBal).to.equal(toAtomicUnits(120));
    })
  });



  describe("Charlie chooses rock and Bob choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 1, bob, 3, salt)
    });

    it("Charlie should have 120 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(120));
    })

    it("Bob should have 80 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(80));
    })
  });

  describe("Charlie chooses rock and Bob choses paper", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 1, bob, 2, salt)
    });

    it("Charlie should have 80 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(80));
    })

    it("Bob should have 120 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(120));
    })
  });

  describe("Charlie chooses rock and Bob choses rock", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 1, bob, 1, salt)
    });

    it("Charlie should have 100 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(100));
    })

    it("Bob should have 100 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(100));
    })
  });

  describe("Charlie chooses paper and Bob choses scissors", async function () {

    beforeEach(async function(){
      await makeAndTake(charlie, 2, bob, 3, salt)
    });

    it("Charlie should have 100 USDC in her wallet", async function(){
      const charlieBal = await usdc.balanceOf(charlie.address)
      expect(charlieBal).to.equal(toAtomicUnits(80));
    })

    it("Bob should have 100 USDC in his wallet", async function(){
      const bobBal = await usdc.balanceOf(bob.address)
      expect(bobBal).to.equal(toAtomicUnits(120));
    })
  });
  
  /* 
    TO DO:
    - When tying, nothing should happen 
    - Should revert when revealing something different
    - Should not be able to play against one's self
    - When the deadline is surpassed, revealing should do nothing
    */
});
