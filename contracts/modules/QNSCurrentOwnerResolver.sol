// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSNameResolver.sol";

interface IQNNSCurrent {
    function ownerOf(uint256 tokenId) external view returns (address);
    function isActive(bytes32 nameHash) external view returns (bool);
}

contract QNSCurrentOwnerResolver is IQNSNameResolver {
    IQNNSCurrent public immutable qnns;

    error InvalidQNNS();

    constructor(address qnnsAddress) {
        if (qnnsAddress == address(0)) revert InvalidQNNS();
        qnns = IQNNSCurrent(qnnsAddress);
    }

    function ownerOfName(bytes32 nameHash) external view returns (address owner, bool active) {
        active = qnns.isActive(nameHash);
        if (!active) return (address(0), false);
        owner = qnns.ownerOf(uint256(nameHash));
    }
}
