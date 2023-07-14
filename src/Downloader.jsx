import React from 'react';
import { useState } from "react";

import {
  DOWNLOAD_ERROR,
  JOB_FINISHED,
  SEGMENT,
  SEGMENT_CHUNK_SIZE,
  SEGMENT_STARTING_DOWNLOAD,
  SEGMENT_STICHING,
  STARTING_DOWNLOAD,
  START_DOWNLOAD,
} from "./constant";

import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import parseHls from "./parseHls";


const Downloader = () => {
  const [downloadState, setdownloadState] = useState(START_DOWNLOAD);
  const [sendHeaderWhileFetchingTS, setsendHeaderWhileFetchingTS] =
    useState(false);
  const [additionalMessage, setadditionalMessage] = useState();
  const [downloadBlobUrl, setdownloadBlobUrl] = useState();

  const [url, setUrl] = useState('');

  async function startDownload() {
    setdownloadState(STARTING_DOWNLOAD);
    console.log(`[INFO] Job started`);
    try {
      console.log(`[INFO] Fetching segments`);
      let getSegments = await parseHls({ hlsUrl: url, headers: "" });
      if (getSegments.type !== SEGMENT)
        throw new Error(`Invalid segment url, Please refresh the page`);

      let segments = getSegments.data.map((s, i) => ({ ...s, index: i })); // comment out .slice

      console.log(`[INFO] Initializing ffmpeg`);
      const ffmpeg = createFFmpeg({
        mainName: "main",
        corePath:
          "https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js",
        log: false,
      });

      await ffmpeg.load();
      console.log(`[SUCCESS] ffmpeg loaded`);

      setdownloadState(SEGMENT_STARTING_DOWNLOAD);

      let segmentChunks = [];
      for (let i = 0; i < segments.length; i += SEGMENT_CHUNK_SIZE) {
        segmentChunks.push(segments.slice(i, i + SEGMENT_CHUNK_SIZE));
      }

      let successSegments = [];

      for (let i = 0; i < segmentChunks.length; i++) {
        setadditionalMessage(`[INFO] Downloading segment chunks ${i}/${segmentChunks.length} - Chunksize: ${SEGMENT_CHUNK_SIZE}`);
        console.log(
          `[INFO] Downloading segment chunks ${i}/${segmentChunks.length} - Chunksize: ${SEGMENT_CHUNK_SIZE}`
        );

        let segmentChunk = segmentChunks[i];

        await Promise.all(
          segmentChunk.map(async (segment) => {
            try {
              let fileId = `${segment.index}.ts`;
              let getFile = await fetch(segment.uri, {
                headers: {
                  ...(sendHeaderWhileFetchingTS ? headers : {}),
                },
              });

              if (!getFile.ok) throw new Error("File failed to fetch");

              ffmpeg.FS(
                "writeFile",
                fileId,
                await fetchFile(await getFile.arrayBuffer())
              );
              successSegments.push(fileId);
              console.log(`[SUCCESS] Segment downloaded ${segment.index}`);
            } catch (error) {
              console.log(`[ERROR] Segment download error ${segment.index}`);
            }
          })
        );
      }

      successSegments = successSegments.sort((a, b) => {
        let aIndex = parseInt(a.split(".")[0]);
        let bIndex = parseInt(b.split(".")[0]);
        return aIndex - bIndex;
      });

      console.log("successSegments", successSegments);

      console.log(`[INFO] Stiching segments started`);
      setdownloadState(SEGMENT_STICHING);

      await ffmpeg.run(
        "-i",
        `concat:${successSegments.join("|")}`,
        "-c",
        "copy",
        "output.ts"
      );

      console.log(`[INFO] Stiching segments finished`);

      successSegments.forEach((segment) => {
        // cleanup
        try {
          ffmpeg.FS("unlink", segment);
        } catch (_) {}
      });

      let data;

      try {
        data = ffmpeg.FS("readFile", "output.ts");
        console.log(data)
      } catch (_) {
        throw new Error(`Something went wrong while stiching!`);
      }

      setadditionalMessage();
      setdownloadState(JOB_FINISHED);
      setdownloadBlobUrl(
        URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }))
      );

      setTimeout(() => {
        ffmpeg.exit(); // ffmpeg.exit() is callable only after load() stage.
      }, 1000);
    } catch (error) {
      setadditionalMessage();
      setdownloadState(DOWNLOAD_ERROR);
      console.log(error.message);
    }
  }

  return (
    <div>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter HLS video URL"
      />
      <button onClick={startDownload}>Download HLS Video</button>
      {additionalMessage && <p>{additionalMessage}</p>}

      {downloadBlobUrl && (
        <div className="flex gap-2 items-center">
          <a
            href={downloadBlobUrl}
            download={`hls-downloader-${new Date()
              .toLocaleDateString()
              .replace(/[/]/g, "-")}.mp4`} // .mp4 is widely supported, and player knows the mimetype so it doesn't matter
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
          >
            Download now
          </a>

          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
          >
            Create new
          </button>
        </div>
      )}

    </div>
  );
};

export default Downloader;
