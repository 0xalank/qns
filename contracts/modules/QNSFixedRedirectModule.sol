// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSModule.sol";

contract QNSFixedRedirectModule is IQNSModule, IQNSRoutableModule {
    bytes32 public constant REDIRECT_TOPOLOGY = 0xe83c66cbf3d417805e6d19d933996a5e7a030118d14a87ed657885a5af454fd6;
    bytes32 public constant REDIRECT_RENDERER = 0x8624f1122126df1c20b0efc11b03f06e0e3f8e04c2900ce39f8e5ab78bc43e25;
    string public constant TITLE = "QNS Mainnet Redirect Demo";
    string public constant TARGET_URL = "https://qu.ai";

    function moduleVersion() external pure returns (uint16) {
        return 1;
    }

    function moduleTopology() external pure returns (bytes32) {
        return REDIRECT_TOPOLOGY;
    }

    function moduleManifestHash() public pure returns (bytes32) {
        return keccak256(moduleManifest());
    }

    function moduleManifest() public pure returns (bytes memory) {
        bytes32[] memory providerMethodIds = new bytes32[](0);

        return abi.encode(ModuleManifestV1({
            version: 1,
            topology: REDIRECT_TOPOLOGY,
            rendererId: REDIRECT_RENDERER,
            contentMode: bytes32(0),
            title: TITLE,
            defaultRoute: "/",
            permissionPolicy: PermissionPolicyV1({
                flags: 0,
                providerMethodIds: providerMethodIds
            }),
            resourceBudget: ResourceBudgetV1({
                maxManifestBytes: 4096,
                maxRoutePayloadBytes: 4096,
                maxContractReads: 4,
                maxTotalLoadedBytes: 4096,
                maxRenderMillis: 1000
            }),
            topologyData: abi.encode(RedirectManifestV1({
                targetUrl: TARGET_URL,
                targetContentHash: bytes32(0),
                mode: 1,
                preservePath: false
            }))
        }));
    }

    function resolveRoute(
        bytes calldata,
        bytes calldata
    ) external pure returns (bytes32 renderer, bytes memory payload, bytes32 payloadHash) {
        payload = moduleManifest();
        return (REDIRECT_RENDERER, payload, keccak256(payload));
    }
}
