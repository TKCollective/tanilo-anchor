// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TaniloAnchor — publishes Merkle roots of Tanilo receipt canonical hashes.
/// @notice One root per batch. The contract stores the block timestamp at which a root was
///         first anchored so a verifier can confirm an anchor with a single eth_call
///         (`anchoredAt(root) != 0`) and read the batch metadata from the `Anchored` event.
///         It proves *existence before block time*; it does not vouch for receipt content.
contract TaniloAnchor {
    event Anchored(
        bytes32 indexed root,
        bytes32 indexed batchId,
        address indexed publisher,
        uint64 leafCount,
        uint64 blockTime
    );
    event PublisherChanged(address indexed previous, address indexed current);

    error NotPublisher();
    error ZeroRoot();
    error AlreadyAnchored(bytes32 root);

    /// @notice root => block.timestamp of first anchoring (0 = never anchored).
    mapping(bytes32 => uint64) public anchoredAt;
    /// @notice root => block number of first anchoring (0 = never anchored).
    mapping(bytes32 => uint64) public anchoredBlock;
    /// @notice The only account allowed to anchor. Rotate with setPublisher from the current one.
    address public publisher;

    constructor(address initialPublisher) {
        publisher = initialPublisher;
        emit PublisherChanged(address(0), initialPublisher);
    }

    function setPublisher(address next) external {
        if (msg.sender != publisher) revert NotPublisher();
        emit PublisherChanged(publisher, next);
        publisher = next;
    }

    function anchor(bytes32 root, uint64 leafCount, bytes32 batchId) external {
        if (msg.sender != publisher) revert NotPublisher();
        if (root == bytes32(0)) revert ZeroRoot();
        if (anchoredAt[root] != 0) revert AlreadyAnchored(root);
        anchoredAt[root] = uint64(block.timestamp);
        anchoredBlock[root] = uint64(block.number);
        emit Anchored(root, batchId, msg.sender, leafCount, uint64(block.timestamp));
    }
}
