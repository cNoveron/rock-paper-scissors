//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.7.0;

// We import this library to be able to use console.log
import "hardhat/console.sol";


// This is the main building block for smart contracts.
contract RockPaperScissors {

    struct TakenBet{
        address taker,
        uint256 deadline,
        bytes32 makersChoiceHash,
        string takersChoicePlain
    }

    mapping(address => TakenBet) currentBet;


    function take(
        uint8 v,
        bytes32 r,
        bytes32 s,
        address maker,
        uint256 deadline,
        bytes32 makersChoiceHash,
        string takersChoicePlain
    ) external {
        //require(msg.sender != maker, "take: You can't play against yourself");
        require(block.timestamp < deadline, "Signed transaction expired");

        uint chainId;
        assembly {
            chainId := chainid
        }
        
        bytes32 eip712DomainHash = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("SetTest")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );  

        bytes32 hashStruct = keccak256(
            abi.encode(
                keccak256("TakenBet(address maker,uint256 deadline,bytes32 makersChoiceHash,string takersChoicePlain)"),
                maker,
                deadline,
                makersChoiceHash,
                takersChoicePlain
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, hashStruct));
        address signer = ecrecover(hash, v, r, s);
        require(signer == maker, "take: invalid signature");
        require(signer != address(0), "ECDSA: invalid signature");

        require(currentOpponent[maker].taker == address(0), "take: bet is already taken");
        currentBet[maker] = TakenBet(msg.sender, deadline, makersChoiceHash, takersChoicePlain);
        // Now the maker can reveal their bet before the deadline and claim the bet 
    }
}
