// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IQNSModule.sol";

contract QNSStaticContentStore is IQNSStaticContentStore {
    uint32 public constant MAX_CONTENT_BYTES = 64 * 1024;
    uint32 public constant MAX_CHUNK_BYTES = 4 * 1024;

    struct ContentRecord {
        address controller;
        bytes32 contentHash;
        uint32 byteLength;
        uint16 chunkCount;
    }

    uint256 public nextContentId = 1;

    mapping(uint256 => ContentRecord) public contents;
    mapping(uint256 => mapping(uint16 => bytes)) private _chunks;

    event ContentCreated(
        uint256 indexed contentId,
        address indexed controller,
        bytes32 contentHash,
        uint32 byteLength,
        uint16 chunkCount
    );
    event ContentChunkStored(uint256 indexed contentId, uint16 indexed chunkIndex, bytes32 chunkHash, uint32 chunkBytes);

    error InvalidContent();
    error InvalidChunk();

    function createContent(
        bytes32 contentHash,
        uint32 byteLength,
        bytes[] calldata chunks
    ) external returns (uint256 contentId) {
        if (
            contentHash == bytes32(0) ||
            byteLength == 0 ||
            byteLength > MAX_CONTENT_BYTES ||
            chunks.length == 0 ||
            chunks.length > type(uint16).max
        ) revert InvalidContent();

        contentId = nextContentId++;
        uint32 bytesWritten = 0;

        for (uint256 i = 0; i < chunks.length; i++) {
            bytes calldata chunk = chunks[i];
            if (chunk.length == 0 || chunk.length > MAX_CHUNK_BYTES) revert InvalidChunk();
            bytesWritten += uint32(chunk.length);
            _chunks[contentId][uint16(i)] = chunk;
            emit ContentChunkStored(contentId, uint16(i), keccak256(chunk), uint32(chunk.length));
        }

        if (bytesWritten != byteLength) revert InvalidContent();

        contents[contentId] = ContentRecord({
            controller: msg.sender,
            contentHash: contentHash,
            byteLength: byteLength,
            chunkCount: uint16(chunks.length)
        });

        emit ContentCreated(contentId, msg.sender, contentHash, byteLength, uint16(chunks.length));
    }

    function getContentChunk(uint256 contentId, uint16 chunkIndex) external view returns (bytes memory) {
        ContentRecord memory record = contents[contentId];
        if (record.controller == address(0) || chunkIndex >= record.chunkCount) revert InvalidChunk();
        return _chunks[contentId][chunkIndex];
    }
}
