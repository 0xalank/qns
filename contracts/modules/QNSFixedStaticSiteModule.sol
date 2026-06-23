// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSModule.sol";

contract QNSFixedStaticSiteModule is IQNSModule, IQNSRoutableModule, IQNSStaticContentStore {
    bytes32 public constant STATIC_SITE_TOPOLOGY = 0x79844e650577da7b679098174ff1e92bab7cad7249e559505c0daf6b2734a6a0;
    bytes32 public constant STATIC_SAFE_RENDERER = 0x22fd625d7fddc14a58d287fa9c2cc7641e7df64e1fbeb66c781c50f245018712;
    string public constant TITLE = "QNS Mainnet Static Demo";
    string public constant ENTRY_PATH = "/index.md";
    uint256 public constant CONTENT_ID = 1;
    uint16 public constant CHUNK_COUNT = 1;
    uint32 public constant MAX_CONTENT_BYTES = 4096;

    bytes private _content;

    error InvalidStaticContent();
    error InvalidChunk();

    constructor(bytes memory content) {
        if (content.length == 0 || content.length > MAX_CONTENT_BYTES) revert InvalidStaticContent();
        _content = content;
    }

    function moduleVersion() external pure returns (uint16) {
        return 1;
    }

    function moduleTopology() external pure returns (bytes32) {
        return STATIC_SITE_TOPOLOGY;
    }

    function moduleManifestHash() public view returns (bytes32) {
        return keccak256(moduleManifest());
    }

    function moduleManifest() public view returns (bytes memory) {
        bytes32[] memory providerMethodIds = new bytes32[](0);
        bytes memory content = _content;
        bytes32 contentHash = keccak256(content);

        StaticFileRefV1[] memory files = new StaticFileRefV1[](1);
        files[0] = StaticFileRefV1({
            path: ENTRY_PATH,
            mimeType: QNSModuleIds.mimeTextMarkdown(),
            byteLength: uint32(content.length),
            contentHash: contentHash,
            contentId: CONTENT_ID,
            chunkCount: CHUNK_COUNT
        });

        bytes32 rootHash = keccak256(abi.encodePacked(
            bytes32(0),
            keccak256(bytes(ENTRY_PATH)),
            QNSModuleIds.mimeTextMarkdown(),
            uint32(content.length),
            contentHash,
            uint256(CONTENT_ID),
            uint16(CHUNK_COUNT)
        ));

        bytes memory topologyData = abi.encode(StaticSiteManifestV1({
            contentStore: address(this),
            entryPath: ENTRY_PATH,
            rootHash: rootHash,
            htmlPolicy: 1,
            files: files
        }));

        return abi.encode(ModuleManifestV1({
            version: 1,
            topology: STATIC_SITE_TOPOLOGY,
            rendererId: STATIC_SAFE_RENDERER,
            contentMode: QNSModuleIds.contentModeNone(),
            title: TITLE,
            defaultRoute: ENTRY_PATH,
            permissionPolicy: PermissionPolicyV1({
                flags: 0,
                providerMethodIds: providerMethodIds
            }),
            resourceBudget: ResourceBudgetV1({
                maxManifestBytes: 8192,
                maxRoutePayloadBytes: 8192,
                maxContractReads: 4,
                maxTotalLoadedBytes: MAX_CONTENT_BYTES,
                maxRenderMillis: 1000
            }),
            topologyData: topologyData
        }));
    }

    function resolveRoute(
        bytes calldata,
        bytes calldata
    ) external view returns (bytes32 renderer, bytes memory payload, bytes32 payloadHash) {
        payload = moduleManifest();
        return (STATIC_SAFE_RENDERER, payload, keccak256(payload));
    }

    function getContentChunk(uint256 contentId, uint16 chunkIndex) external view returns (bytes memory) {
        if (contentId != CONTENT_ID || chunkIndex != 0) revert InvalidChunk();
        return _content;
    }
}
