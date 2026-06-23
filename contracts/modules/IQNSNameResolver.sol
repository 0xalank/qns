// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IQNSNameResolver {
    function ownerOfName(bytes32 nameHash) external view returns (address owner, bool active);
}
