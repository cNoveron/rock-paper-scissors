//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.7.0;

// We import this library to be able to use console.log
import "hardhat/console.sol";


// This is the main building block for smart contracts.
contract RockPaperScissors {

    struct TakenBet{
        address taker;
        uint256 deadline;
        bytes32 makersChoiceHash;
        string takersChoicePlain;
        address payoutToken;
    }

    mapping(address => TakenBet) currentBet;


    function take(
        uint8 v,
        bytes32 r,
        bytes32 s,
        address maker,
        uint256 deadline,
        bytes32 makersChoiceHash,
        string takersChoicePlain,
        address payoutToken
    ) external {
        //require(msg.sender != maker, "take: You can't play against yourself");
        require(block.timestamp < deadline, "Signed transaction expired");

        uint chainId;
        assembly {chainId := chainid()}
        
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
                keccak256("TakenBet(address maker,uint256 deadline,bytes32 makersChoiceHash,string takersChoicePlain,address payoutToken)"),
                maker,
                deadline,
                makersChoiceHash,
                takersChoicePlain,
                payoutToken
            )
        );

        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, hashStruct));
        address signer = ecrecover(hash, v, r, s);
        require(signer == maker, "take: invalid signature");
        require(signer != address(0), "ECDSA: invalid signature");

        require(currentBet[maker].taker == address(0), "take: bet is already taken");
        currentBet[maker] = TakenBet(msg.sender, deadline, makersChoiceHash, takersChoicePlain, payoutToken);
        // Now the maker can reveal their bet before the deadline and claim the bet 
    }

    function reveal(string makersChoicePlain, string salt) external {
        uint chainId;
        assembly {chainId := chainid()}

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

        bytes32 hash = _getChoiceHashFor(msg.sender, makersChoicePlain, salt);
        require(currentBet[msg.sender].makersChoiceHash == hash, "reveal: You didn't chose that move");

        string takersChoicePlain = currentBet[msg.sender].takersChoicePlain;
        address taker = currentBet[msg.sender].taker;
        IERC20 token = IERC20(currentBet[msg.sender].payoutToken);

        if (makersChoicePlain == takersChoicePlain) {
            token.transfer(msg.sender, 10 * 1e18);
            token.transfer(currentBet[msg.sender].taker, 10 * 1e18);
        } else
        if (makersChoicePlain == "ROCK") {
            if (takersChoicePlain == "SCISSORS") {  token.transferFrom(taker, msg.sender, 20 * 1e18); } else
            if (takersChoicePlain == "PAPER") {     token.transferFrom(msg.sender, taker, 20 * 1e18); }
        } else
        if (makersChoicePlain == "PAPER") {
            if (takersChoicePlain == "ROCK") {      token.transferFrom(taker, msg.sender, 20 * 1e18); } else
            if (takersChoicePlain == "SCISSORS") {  token.transferFrom(msg.sender, taker, 20 * 1e18); }
        } else
        if (makersChoicePlain == "SCISSORS") {
            if (takersChoicePlain == "PAPER") {     token.transferFrom(taker, msg.sender, 20 * 1e18); } else
            if (takersChoicePlain == "ROCK") {      token.transferFrom(msg.sender, taker, 20 * 1e18); }
        }
    }

    function getMyChoiceHash(string makersChoicePlain, string salt) external view returns (bytes32 hash) {
        hash = _getChoiceHash(msg.sender, makersChoicePlain, keccak256(salt));
    }

    function _getChoiceHashFor(address maker, string makersChoicePlain, string salt) private pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                maker,
                makersChoicePlain,
                salt
            )
        );
    }
}
