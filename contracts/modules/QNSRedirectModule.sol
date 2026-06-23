// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./QNSBaseModule.sol";

contract QNSRedirectModule is QNSBaseModule, IQNSRoutableModule {
    error InvalidRedirectMode();
    error InvalidRedirectTarget();

    constructor(
        string memory title,
        string memory targetUrl,
        bytes32 targetContentHash,
        uint8 mode,
        bool preservePath
    ) QNSBaseModule(QNSModuleIds.topologyRedirect(), _buildManifest(title, targetUrl, targetContentHash, mode, preservePath)) {}

    function resolveRoute(
        bytes calldata,
        bytes calldata
    ) external view returns (bytes32 renderer, bytes memory payload, bytes32 payloadHash) {
        payload = moduleManifest();
        return (QNSModuleIds.rendererRedirect(), payload, keccak256(payload));
    }

    function _buildManifest(
        string memory title,
        string memory targetUrl,
        bytes32 targetContentHash,
        uint8 mode,
        bool preservePath
    ) private pure returns (bytes memory) {
        if (bytes(targetUrl).length == 0) revert InvalidRedirectTarget();
        if (mode != 1 && mode != 2) revert InvalidRedirectMode();

        bytes memory topologyData = abi.encode(RedirectManifestV1({
            targetUrl: targetUrl,
            targetContentHash: targetContentHash,
            mode: mode,
            preservePath: preservePath
        }));

        bytes32[] memory providerMethodIds = new bytes32[](0);

        return abi.encode(ModuleManifestV1({
            version: 1,
            topology: QNSModuleIds.topologyRedirect(),
            rendererId: QNSModuleIds.rendererRedirect(),
            contentMode: QNSModuleIds.contentModeNone(),
            title: title,
            defaultRoute: "/",
            permissionPolicy: PermissionPolicyV1({flags: 0, providerMethodIds: providerMethodIds}),
            resourceBudget: ResourceBudgetV1({
                maxManifestBytes: 4096,
                maxRoutePayloadBytes: 4096,
                maxContractReads: 4,
                maxTotalLoadedBytes: 4096,
                maxRenderMillis: 1000
            }),
            topologyData: topologyData
        }));
    }
}
