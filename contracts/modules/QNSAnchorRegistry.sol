// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSModule.sol";
import "./IQNSNameResolver.sol";

contract QNSAnchorRegistry {
    uint16 public constant ANCHOR_VERSION = 1;
    uint256 public constant ANCHOR_BYTES = 96;

    IQNSNameResolver public immutable nameResolver;

    mapping(bytes32 => bytes) private _anchors;

    event AnchorSet(
        bytes32 indexed nameHash,
        address indexed owner,
        bytes32 indexed topology,
        bytes anchor,
        bytes32 manifestHash
    );
    event AnchorCleared(bytes32 indexed nameHash, address indexed owner);

    error InvalidNameResolver();
    error InvalidAnchor();
    error UnsupportedAnchorVersion();
    error InvalidModule();
    error NameNotActive();
    error NotNameOwner();

    constructor(address nameResolverAddress) {
        if (nameResolverAddress == address(0)) revert InvalidNameResolver();
        nameResolver = IQNSNameResolver(nameResolverAddress);
    }

    function anchorOf(bytes32 nameHash) external view returns (bytes memory) {
        return _anchors[nameHash];
    }

    function setAnchor(bytes32 nameHash, bytes calldata anchor) external {
        address owner = _requireActiveOwner(nameHash);
        QNSAnchor memory decoded = decodeAnchor(anchor);
        _validateModule(decoded);
        _anchors[nameHash] = anchor;
        emit AnchorSet(nameHash, owner, decoded.topology, anchor, decoded.manifestHash);
    }

    function clearAnchor(bytes32 nameHash) external {
        address owner = _requireActiveOwner(nameHash);
        delete _anchors[nameHash];
        emit AnchorCleared(nameHash, owner);
    }

    function decodeAnchor(bytes calldata anchor) public pure returns (QNSAnchor memory decoded) {
        if (anchor.length != ANCHOR_BYTES) revert InvalidAnchor();

        bytes32 word0;
        bytes32 word1;
        bytes32 word2;
        assembly {
            word0 := calldataload(anchor.offset)
            word1 := calldataload(add(anchor.offset, 32))
            word2 := calldataload(add(anchor.offset, 64))
        }

        decoded.version = uint16(uint256(word0) >> 240);
        decoded.flags = uint16(uint256(word0) >> 224);
        decoded.chainId = uint64(uint256(word0) >> 160);
        decoded.moduleAddress = address(uint160(uint256(word0)));
        decoded.topology = word1;
        decoded.manifestHash = word2;
    }

    function _requireActiveOwner(bytes32 nameHash) internal view returns (address owner) {
        bool active;
        (owner, active) = nameResolver.ownerOfName(nameHash);
        if (!active) revert NameNotActive();
        if (owner != msg.sender) revert NotNameOwner();
    }

    function _validateModule(QNSAnchor memory anchor) internal view {
        if (anchor.version != ANCHOR_VERSION) revert UnsupportedAnchorVersion();
        if (anchor.moduleAddress == address(0) || anchor.topology == bytes32(0)) revert InvalidAnchor();
        IQNSModule moduleContract = IQNSModule(anchor.moduleAddress);
        if (moduleContract.moduleVersion() != ANCHOR_VERSION) revert InvalidModule();
        if (moduleContract.moduleTopology() != anchor.topology) revert InvalidModule();
        if (moduleContract.moduleManifestHash() != anchor.manifestHash) revert InvalidModule();
        if (keccak256(moduleContract.moduleManifest()) != anchor.manifestHash) revert InvalidModule();
    }
}
