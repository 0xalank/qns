// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSModule.sol";

abstract contract QNSBaseModule is IQNSModule {
    uint16 internal constant MODULE_VERSION = 1;

    bytes32 private immutable _topology;
    bytes32 private immutable _manifestHash;
    bytes private _manifest;

    error InvalidModuleManifest();

    constructor(bytes32 topology_, bytes memory manifest_) {
        if (topology_ == bytes32(0) || manifest_.length == 0) revert InvalidModuleManifest();
        _topology = topology_;
        _manifest = manifest_;
        _manifestHash = keccak256(manifest_);
    }

    function moduleVersion() external pure returns (uint16) {
        return MODULE_VERSION;
    }

    function moduleTopology() external view returns (bytes32) {
        return _topology;
    }

    function moduleManifestHash() external view returns (bytes32) {
        return _manifestHash;
    }

    function moduleManifest() public view returns (bytes memory) {
        return _manifest;
    }
}
