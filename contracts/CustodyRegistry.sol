// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CustodyRegistry - Minimal on-chain custody + sensor anchors
contract CustodyRegistry {
    address public owner;

    event BatchRegistered(bytes32 indexed batchId, string ipfsCid, address indexed manufacturer, uint256 time);
    event CustodyTransferred(bytes32 indexed batchId, address indexed from, address indexed to, uint256 time);
    event SensorAnchored(bytes32 indexed batchId, bytes32 readingHash, address indexed signer, uint256 time);

    // simple mapping of current custodian (optional)
    mapping(bytes32 => address) public currentCustodian;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    // register a new batch
    function registerBatch(bytes32 batchId, string calldata ipfsCid) external {
        // register origin: sender is manufacturer
        emit BatchRegistered(batchId, ipfsCid, msg.sender, block.timestamp);
        currentCustodian[batchId] = msg.sender;
    }

    // transfer custody to next party
    function transferCustody(bytes32 batchId, address to) external {
        require(currentCustodian[batchId] == msg.sender || msg.sender == owner, "not custodian");
        address from = msg.sender;
        currentCustodian[batchId] = to;
        emit CustodyTransferred(batchId, from, to, block.timestamp);
    }

    // anchor a sensor reading: readingHash is keccak256 of raw payload; signer is off-chain signer address recovered client-side
    // For demo we accept signer as provided (indexer will verify signature when needed)
    function anchorSensor(bytes32 batchId, bytes32 readingHash, bytes calldata /*signature*/ ) external {
        // In full implementation, recover signer and validate; for hackathon demo, we keep simple
        emit SensorAnchored(batchId, readingHash, msg.sender, block.timestamp);
    }
}
