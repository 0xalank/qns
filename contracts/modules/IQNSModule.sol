// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct QNSAnchor {
    uint16 version;
    uint16 flags;
    uint64 chainId;
    address moduleAddress;
    bytes32 topology;
    bytes32 manifestHash;
}

struct PermissionPolicyV1 {
    uint32 flags;
    bytes32[] providerMethodIds;
}

struct ResourceBudgetV1 {
    uint32 maxManifestBytes;
    uint32 maxRoutePayloadBytes;
    uint32 maxContractReads;
    uint32 maxTotalLoadedBytes;
    uint32 maxRenderMillis;
}

struct ModuleManifestV1 {
    uint16 version;
    bytes32 topology;
    bytes32 rendererId;
    bytes32 contentMode;
    string title;
    string defaultRoute;
    PermissionPolicyV1 permissionPolicy;
    ResourceBudgetV1 resourceBudget;
    bytes topologyData;
}

struct RedirectManifestV1 {
    string targetUrl;
    bytes32 targetContentHash;
    uint8 mode;
    bool preservePath;
}

struct StaticFileRefV1 {
    string path;
    bytes32 mimeType;
    uint32 byteLength;
    bytes32 contentHash;
    uint256 contentId;
    uint16 chunkCount;
}

struct StaticSiteManifestV1 {
    address contentStore;
    string entryPath;
    bytes32 rootHash;
    uint8 htmlPolicy;
    StaticFileRefV1[] files;
}

interface IQNSModule {
    function moduleVersion() external view returns (uint16);
    function moduleTopology() external view returns (bytes32);
    function moduleManifestHash() external view returns (bytes32);
    function moduleManifest() external view returns (bytes memory);
}

interface IQNSRoutableModule {
    function resolveRoute(
        bytes calldata path,
        bytes calldata query
    ) external view returns (bytes32 renderer, bytes memory payload, bytes32 payloadHash);
}

interface IQNSStaticContentStore {
    function getContentChunk(uint256 contentId, uint16 chunkIndex) external view returns (bytes memory);
}

library QNSModuleIds {
    function topologyRedirect() internal pure returns (bytes32) {
        return keccak256(bytes("qns.topology.redirect.v1"));
    }

    function topologyStaticSite() internal pure returns (bytes32) {
        return keccak256(bytes("qns.topology.static-site.v1"));
    }

    function rendererRedirect() internal pure returns (bytes32) {
        return keccak256(bytes("qns.renderer.redirect.v1"));
    }

    function rendererStaticSafe() internal pure returns (bytes32) {
        return keccak256(bytes("qns.renderer.static-safe.v1"));
    }

    function contentModeNone() internal pure returns (bytes32) {
        return bytes32(0);
    }

    function mimeTextMarkdown() internal pure returns (bytes32) {
        return keccak256(bytes("text/markdown"));
    }

    function mimeTextPlain() internal pure returns (bytes32) {
        return keccak256(bytes("text/plain"));
    }

    function mimeTextHtml() internal pure returns (bytes32) {
        return keccak256(bytes("text/html"));
    }

    function mimeTextCss() internal pure returns (bytes32) {
        return keccak256(bytes("text/css"));
    }
}
