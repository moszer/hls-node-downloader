import React, { useState } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import parseHls from './parseHls';

const Downloader = () => {
  const [downloadState, setDownloadState] = useState('START_DOWNLOAD');
  const [additionalMessage, setAdditionalMessage] = useState('');
  const [downloadBlobUrl, setDownloadBlobUrl] = useState('');
  const [url, setUrl] = useState('');

  async function startDownload() {
    setDownloadState('STARTING_DOWNLOAD');
    console.log('[INFO] Job started');
    
    try {
      console.log('[INFO] Fetching segments');
      const getSegments = await parseHls({ hlsUrl: url, headers: '' });
      if (getSegments.type !== 'SEGMENT')
        throw new Error('Invalid segment URL. Please refresh the page.');

      const segments = getSegments.data.map((s, i) => ({ ...s, index: i }));

      console.log('[INFO] Initializing ffmpeg');
      const ffmpeg = createFFmpeg({
        mainName: 'main',
        corePath:
          'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
        log: false,
      });

      await ffmpeg.load();
      console.log('[SUCCESS] ffmpeg loaded');

      setDownloadState('SEGMENT_STARTING_DOWNLOAD');

      const segmentChunks = [];
      for (let i = 0; i < segments.length; i += 10) {
        segmentChunks.push(segments.slice(i, i + 10));
      }

      const successSegments = [];

      for (let i = 0; i < segmentChunks.length; i++) {
        setAdditionalMessage(`[INFO] Downloading segment chunks ${i}/${segmentChunks.length}`);
        console.log(`[INFO] Downloading segment chunks ${i}/${segmentChunks.length}`);

        const segmentChunk = segmentChunks[i];

        await Promise.all(
          segmentChunk.map(async (segment) => {
            try {
              const fileId = `${segment.index}.ts`;
              const getFile = await fetch(segment.uri);
              if (!getFile.ok) throw new Error('File failed to fetch');

              ffmpeg.FS(
                'writeFile',
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

      successSegments.sort((a, b) => {
        const aIndex = parseInt(a.split('.')[0]);
        const bIndex = parseInt(b.split('.')[0]);
        return aIndex - bIndex;
      });

      console.log('successSegments', successSegments);

      console.log('[INFO] Stitching segments started');
      setDownloadState('SEGMENT_STITCHING');

      await ffmpeg.run(
        '-i',
        `concat:${successSegments.join('|')}`,
        '-c',
        'copy',
        'output.mp4' // Change output file extension to mp4
      );

      console.log('[INFO] Stitching segments finished');

      successSegments.forEach((segment) => {
        try {
          ffmpeg.FS('unlink', segment);
        } catch (_) {}
      });

      let data;

      try {
        data = ffmpeg.FS('readFile', 'output.mp4'); // Change the file name to mp4
        console.log(data);
      } catch (_) {
        throw new Error('Something went wrong while stitching!');
      }

      setAdditionalMessage('');
      setDownloadState('JOB_FINISHED');
      setDownloadBlobUrl(
        URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' })) // Change MIME type to video/mp4
      );

      setTimeout(() => {
        ffmpeg.exit();
      }, 1000);
    } catch (error) {
      setAdditionalMessage('');
      setDownloadState('DOWNLOAD_ERROR');
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
            download={`hls-downloader-${new Date().toLocaleDateString().replace(/\//g, '-')}.mp4`}
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