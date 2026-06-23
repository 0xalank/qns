// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSNameResolver.sol";

contract QNSStaticNameResolver is IQNSNameResolver {
    address public admin;

    struct NameRecord {
        address owner;
        bool active;
    }

    mapping(bytes32 => NameRecord) private _records;

    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event NameRecordSet(bytes32 indexed nameHash, address indexed owner, bool active);

    error NotAdmin();
    error InvalidNameRecord();

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert InvalidNameRecord();
        admin = initialAdmin;
        emit AdminTransferred(address(0), initialAdmin);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidNameRecord();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function setNameRecord(bytes32 nameHash, address owner, bool active) external onlyAdmin {
        if (nameHash == bytes32(0) || (active && owner == address(0))) {
            revert InvalidNameRecord();
        }

        _records[nameHash] = NameRecord({owner: owner, active: active});
        emit NameRecordSet(nameHash, owner, active);
    }

    function ownerOfName(bytes32 nameHash) external view returns (address owner, bool active) {
        NameRecord memory record = _records[nameHash];
        return (record.owner, record.active);
    }
}
