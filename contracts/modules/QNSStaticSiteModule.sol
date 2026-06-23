// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./QNSBaseModule.sol";

contract QNSStaticSiteModule is QNSBaseModule, IQNSRoutableModule {
    error InvalidStaticSite();

    constructor(
        string memory title,
        address contentStore,
        string memory entryPath,
        uint8 htmlPolicy,
        StaticFileRefV1[] memory files
    ) QNSBaseModule(QNSModuleIds.topologyStaticSite(), _buildManifest(title, contentStore, entryPath, htmlPolicy, files)) {}

    function resolveRoute(
        bytes calldata,
        bytes calldata
    ) external view returns (bytes32 renderer, bytes memory payload, bytes32 payloadHash) {
        payload = moduleManifest();
        return (QNSModuleIds.rendererStaticSafe(), payload, keccak256(payload));
    }

    function _buildManifest(
        string memory title,
        address contentStore,
        string memory entryPath,
        uint8 htmlPolicy,
        StaticFileRefV1[] memory files
    ) private pure returns (bytes memory) {
        if (contentStore == address(0) || bytes(entryPath).length == 0 || files.length == 0) revert InvalidStaticSite();
        if (htmlPolicy != 1 && htmlPolicy != 2) revert InvalidStaticSite();

        bytes32 rootHash = _rootHash(files);
        bytes memory topologyData = abi.encode(StaticSiteManifestV1({
            contentStore: contentStore,
            entryPath: entryPath,
            rootHash: rootHash,
            htmlPolicy: htmlPolicy,
            files: files
        }));

        bytes32[] memory providerMethodIds = new bytes32[](0);

        return abi.encode(ModuleManifestV1({
            version: 1,
            topology: QNSModuleIds.topologyStaticSite(),
            rendererId: QNSModuleIds.rendererStaticSafe(),
            contentMode: QNSModuleIds.contentModeNone(),
            title: title,
            defaultRoute: entryPath,
            permissionPolicy: PermissionPolicyV1({flags: 0, providerMethodIds: providerMethodIds}),
            resourceBudget: ResourceBudgetV1({
                maxManifestBytes: 32 * 1024,
                maxRoutePayloadBytes: 32 * 1024,
                maxContractReads: 32,
                maxTotalLoadedBytes: 128 * 1024,
                maxRenderMillis: 2000
            }),
            topologyData: topologyData
        }));
    }

    function _rootHash(StaticFileRefV1[] memory files) private pure returns (bytes32 root) {
        for (uint256 i = 0; i < files.length; i++) {
            StaticFileRefV1 memory file = files[i];
            if (
                bytes(file.path).length == 0 ||
                file.mimeType == bytes32(0) ||
                file.byteLength == 0 ||
                file.contentHash == bytes32(0) ||
                file.chunkCount == 0
            ) revert InvalidStaticSite();

            root = keccak256(abi.encodePacked(
                root,
                keccak256(bytes(file.path)),
                file.mimeType,
                uint32(file.byteLength),
                file.contentHash,
                uint256(file.contentId),
                uint16(file.chunkCount)
            ));
        }
    }
}
