//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.7.0;

// We import this library to be able to use console.log
import "hardhat/console.sol";

import "./IERC20.sol";

// This is the main building block for smart contracts.
contract RockPaperScissors {



    function _getDomainHash() private returns (bytes32 eip712DomainHash) {
        uint chainId;
        assembly { chainId := chainid() }

        eip712DomainHash = keccak256(
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
    }



    struct TakenBet{
        address taker;
        uint256 deadline;
        bytes32 makersChoiceHash;
        uint8 takersChoicePlain;
        address payoutToken;
    }

    mapping(bytes32 => TakenBet) private takenBets;

    mapping(address => uint256[]) public myActiveBets;


    function take(
        uint8[3] v,
        bytes32[3] r,
        bytes32[3] s,
        address maker,
        uint256 deadline,
        bytes32 makersChoiceHash,
        uint8 takersChoicePlain,
        address payoutToken
    ) external {
        //require(msg.sender != maker, "take: You can't play against yourself");
        require(block.timestamp.add(2 days) < deadline, "Timewindow should be at least 2 days");

        payoutToken.permit(msg.sender, address(this), 20 * 1e18, deadline, v[0], r[0], s[0]);
        uint256 allowance = payoutToken.allowance(msg.sender, address(this));
        require(20 * 1e18 <= allowance, "take: Permit taker failed");

        payoutToken.permit(maker, address(this), 20 * 1e18, deadline, v[1], r[1], s[1]);
        uint256 allowance = payoutToken.allowance(maker, address(this));
        require(20 * 1e18 <= allowance, "take: Permit maker failed");

        bytes32 hashStruct = keccak256(
            abi.encode(
                keccak256("TakenBet(address maker,uint256 deadline,bytes32 makersChoiceHash,uint8 takersChoicePlain,address payoutToken)"),
                maker,
                deadline,
                makersChoiceHash,
                takersChoicePlain,
                payoutToken
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", _getDomainHash(), hashStruct));
        address signer = ecrecover(hash, v[2], r[2], s[2]);
        require(signer == maker, "take: invalid signature");
        require(signer != address(0), "ECDSA: invalid signature");

        bytes32 betId = bytes32(abi.encodePacked(block.timestamp, msg.sender, hashStruct));
        require(takenBets[betId].taker == address(0), "take: bet is already taken");
        takenBets[betId] = TakenBet(msg.sender, maker, deadline, makersChoiceHash, takersChoicePlain, payoutToken);
        // Now the maker can reveal their bet before the deadline and claim the bet 

        myActiveBets[maker] = betId;
        myActiveBets[msg.sender] = betId;
        // UI should query this mapping periodically
    }



    event Winner(address winner, uint256 amount);

    function reveal(bytes32 betId, uint8 makersChoicePlain, bytes memory salt) external {
        require(block.timestamp < takenBets[betId].deadline.sub(1 days), "reveal: You must reveal 1 day before deadline");

        bytes32 hash = _getChoiceHashFor(msg.sender, makersChoicePlain, salt);
        require(takenBets[betId].makersChoiceHash == hash, "reveal: You didn't chose that move");

        uint8 takersChoicePlain = takenBets[betId].takersChoicePlain;
        address taker = takenBets[betId].taker;
        IERC20 token = IERC20(takenBets[betId].payoutToken);

        if (makersChoicePlain == 1) {
            if (takersChoicePlain == 3) {
                token.transferFrom(taker, msg.sender, 20 * 1e18); 
                emit Winner(msg.sender, 20 * 1e18);
            } else
            if (takersChoicePlain == 2) {   
                token.transferFrom(msg.sender, taker, 20 * 1e18);  
                emit Winner(taker, 20 * 1e18);
            }
        } else
        if (makersChoicePlain == 2) {
            if (takersChoicePlain == 1) {
                token.transferFrom(taker, msg.sender, 20 * 1e18);
                emit Winner(msg.sender, 20 * 1e18); 
            } else
            if (takersChoicePlain == 3) {
                token.transferFrom(msg.sender, taker, 20 * 1e18);  
                emit Winner(taker, 20 * 1e18);
            }
        } else
        if (makersChoicePlain == 3) {
            if (takersChoicePlain == 2) {
                token.transferFrom(taker, msg.sender, 20 * 1e18); 
                emit Winner(msg.sender, 20 * 1e18); 
            } else
            if (takersChoicePlain == 1) {
                token.transferFrom(msg.sender, taker, 20 * 1e18); 
                emit Winner(taker, 20 * 1e18);
            }
        }
    }



    function getMyChoiceHash(uint8 makersChoicePlain, bytes memory salt) external view returns (bytes32 hash) {
        hash = _getChoiceHashFor(msg.sender, makersChoicePlain, salt);
    }


    function _getChoiceHashFor(address maker, uint8 makersChoicePlain, bytes memory salt) private pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                maker,
                makersChoicePlain,
                salt
            )
        );
    }
}
