//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.7.0;

// We import this library to be able to use console.log
import "hardhat/console.sol";


// This is the main building block for smart contracts.
contract RockPaperScissors {
    function take(
        uint8 v,
        bytes32 r,
        bytes32 s,
        address maker,
        uint256 deadline,
        uint makersChoiceHash,
        uint takersChoicePlain,
    ) external {
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
                keccak256("set(address maker,uint choiceHashA,uint choiceHashB,uint deadline)"),
                maker,
                deadline,
                makeChoiceHash,
                takersChoicePlain
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, hashStruct));
        address signer = ecrecover(hash, v, r, s);
        require(signer == maker, "take: invalid signature");
        require(signer != address(0), "ECDSA: invalid signature");

        currentOpponent[maker] = takerChoiceAndCommitment(msg.sender, takersChoicePlain, makeChoiceHash);
        // Now the maker can reveal their bet before the deadline and claim the bet 
    }
}
