import React, { useState } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import parseHls from './parseHls';
import './App.css'

const Downloader = () => {
  const [additionalMessage, setAdditionalMessage] = useState('');
  const [downloadBlobUrl, setDownloadBlobUrl] = useState('');
  const [url, setUrl] = useState('');

  async function startDownload() {
    setAdditionalMessage('STARTING_DOWNLOAD');
    setAdditionalMessage('[INFO] Job started');
    
    try {
      setAdditionalMessage('[INFO] Fetching segments');
      const getSegments = await parseHls({ hlsUrl: url, headers: '' });
      if (getSegments.type !== 'SEGMENT')
        throw new Error('Invalid segment URL. Please refresh the page.');

      const segments = getSegments.data.map((s, i) => ({ ...s, index: i }));

      setAdditionalMessage('[INFO] Initializing ffmpeg');
      const ffmpeg = createFFmpeg({
        mainName: 'main',
        corePath:
          'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
        log: false,
      });

      await ffmpeg.load();
      setAdditionalMessage('[SUCCESS] ffmpeg loaded');

      setAdditionalMessage('SEGMENT_STARTING_DOWNLOAD');

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
              setAdditionalMessage(`[SUCCESS] Segment downloaded ${segment.index}`);
            } catch (error) {
              setAdditionalMessage(`[ERROR] Segment download error ${segment.index}`);
            }
          })
        );
      }

      successSegments.sort((a, b) => {
        const aIndex = parseInt(a.split('.')[0]);
        const bIndex = parseInt(b.split('.')[0]);
        return aIndex - bIndex;
      });

      setAdditionalMessage('successSegments', successSegments);

      setAdditionalMessage('[INFO] Stitching segments started');
      setAdditionalMessage('SEGMENT_STITCHING');

      await ffmpeg.run(
        '-i',
        `concat:${successSegments.join('|')}`,
        '-c',
        'copy',
        'output.mp4' // Change output file extension to mp4
      );

      setAdditionalMessage('[INFO] Stitching segments finished');

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
      setAdditionalMessage('JOB_FINISHED');
      setDownloadBlobUrl(
        URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' })) // Change MIME type to video/mp4
      );

      setTimeout(() => {
        ffmpeg.exit();
      }, 1000);
    } catch (error) {
      setAdditionalMessage('');
      setAdditionalMessage('DOWNLOAD_ERROR');
      console.log(error.message);
    }
  }

  return (
    <div>
      <input 
        className='text-box'
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter HLS video URL"
      />
      <div className='button-start-download'>
        <button onClick={startDownload}>Download HLS Video</button>
        {additionalMessage && <p className='text-log-download'>{additionalMessage}</p>}
      </div>

      {downloadBlobUrl && (
        <div className="flex gap-2 items-center">
          <a
            href={downloadBlobUrl}
            download={`hls-downloader-${new Date().toLocaleDateString().replace(/\//g, '-')}.mp4`}
            className="Button-download"
          >
            Download now
          </a>

          <button
            onClick={() => window.location.reload()}
            className=""
          >
            Create new
          </button>
        </div>
      )}
    </div>
    
  );
};

export default Downloader;