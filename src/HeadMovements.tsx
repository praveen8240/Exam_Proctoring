import React, { useEffect, useRef, useState } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { Camera, Volume2, Crosshair, Box,Loader } from 'lucide-react';

const HeadMovements = () => {
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [isLoading, setIsLoading] = useState<Boolean>(true);
 const [isLoading1, setIsLoading1] = useState<Boolean>(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const baselineRatioRef = useRef<number | null>(null);
  const ratioHistoryRef = useRef<number[]>([]);
  const frameCountRef = useRef<number>(0);
  const lastMovementTimeRef = useRef<number>(0);
  const movementCountRef = useRef<number>(0);

  const [faceCount, setFaceCount] = useState<number>(0);
  const [headMovementDetected, setHeadMovementDetected] = useState<boolean>(false);
  const [isTalking, setIsTalking] = useState<boolean>(false);
  const [detectedObjects, setDetectedObjects] = useState<Array<{
    class: string;
    score: number;
  }>>([]);

  // Initialize audio context and analyzer
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 2048;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const checkAudio = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            setIsTalking(average > 10);
          }
          requestAnimationFrame(checkAudio);
        };
        checkAudio();
        setIsLoading1(false);
      } catch (error) {
        setErrorMessage(`Audio Mic `+String(error)+` Reload after allowing`)
        setIsLoading(false);
    }
    };

    initializeAudio();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const startDetection = async () => {

      try {
        const model = await cocoSsd.load();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();

          videoRef.current.onloadeddata = () => {
            detectFrame(videoRef.current as HTMLVideoElement, model);
          };
        }
        setIsLoading(false);
      } catch (error) {
        setErrorMessage(`Camera Input `+String(error)+` Reload after allowing`);
        setIsLoading(false);

    }
    };

    startDetection();
  }, []);

  const calculateAverageRatio = (ratios: number[]): number => {
    return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  };

  const detectHeadMovement = (currentRatio: number) => {
    const CALIBRATION_FRAMES = 30;
    const HISTORY_SIZE = 5;
    const TURN_THRESHOLD = 0.1; // More sensitive threshold
    const MOVEMENT_TIMEOUT = 1000; // 1 second timeout for continuous movements
    const CONTINUOUS_MOVEMENTS_THRESHOLD = 2; // Number of movements needed to trigger

    frameCountRef.current++;
    ratioHistoryRef.current.push(currentRatio);

    if (ratioHistoryRef.current.length > HISTORY_SIZE) {
      ratioHistoryRef.current.shift();
    }

    const currentAverageRatio = calculateAverageRatio(ratioHistoryRef.current);

    // Calibration period
    if (frameCountRef.current <= CALIBRATION_FRAMES) {
      if (frameCountRef.current === CALIBRATION_FRAMES) {
        baselineRatioRef.current = currentAverageRatio;
      }
      return;
    }

    // Only proceed if we have a baseline
    if (baselineRatioRef.current !== null) {
      const ratioDifference = Math.abs(currentAverageRatio - baselineRatioRef.current);
      const currentTime = Date.now();
      // Detect significant movement
      if (ratioDifference > TURN_THRESHOLD) {
        // Check if this is a new movement within the timeout period
        if (currentTime - lastMovementTimeRef.current < MOVEMENT_TIMEOUT) {
          movementCountRef.current++;
        } else {
          movementCountRef.current = 1;
        }
        lastMovementTimeRef.current = currentTime;
        // Set head movement detected if we have enough continuous movements
        if (movementCountRef.current >= CONTINUOUS_MOVEMENTS_THRESHOLD) {
          setHeadMovementDetected(true);
        }
      } else {
        // Reset if no movement detected for the timeout period
        if (currentTime - lastMovementTimeRef.current > MOVEMENT_TIMEOUT) {
          movementCountRef.current = 0;
          setHeadMovementDetected(false);
        }
      }
    }
  };

  const detectFrame = (video: HTMLVideoElement, model: cocoSsd.ObjectDetection) => {
    model.detect(video).then((predictions) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const faces = predictions.filter(pred => pred.class === 'person');
          setFaceCount(faces.length);

          const objects = predictions.filter(pred => pred.class !== 'person');
          setDetectedObjects(objects.map(obj => ({
            class: obj.class,
            score: Math.round(obj.score * 100)
          })));

          predictions.forEach((prediction) => {
            const [x, y, width, height] = prediction.bbox;
            const isPerson = prediction.class === 'person';
            
            ctx.strokeStyle = isPerson ? 'red' : 'blue';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            ctx.fillStyle = isPerson ? 'red' : 'blue';
            ctx.fillText(
              `${prediction.class} ${Math.round(prediction.score * 100)}%`,
              x,
              y > 10 ? y - 5 : y + 15
            );

            if (isPerson) {
              const faceRatio = width / height;
              detectHeadMovement(faceRatio);
            }
          });
        }
      }

      requestAnimationFrame(() => detectFrame(video, model));
    });
  };


  if (isLoading || isLoading1) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8">
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Loader className="h-12 w-12 text-blue-600 animate-spin mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Initializing Camera and AI Models
          </h3>
          <p className="text-gray-600">
            Please wait while we set up the detection system...
          </p>
          <p className="text-red-600">
{errorMessage}          </p>        </div>
      </div>
    );
  }

  return (
<div className='w-screen h-screen flex flex-col lg:flex-row md:flex-row gap-4'>
  <div className="p-4 flex justify-center items-center">
    <video ref={videoRef} className="hidden" width={720} height={560} />
    <canvas ref={canvasRef} width={720} height={560} className="border border-gray-300 rounded-lg" />
  </div>
  <div className="bg-gray-100 p-6 rounded-lg shadow-md w-full lg:w-1/3">
    <h2 className="text-xl font-bold text-gray-800 mb-4">Key Points</h2>
    <ul className="space-y-3">
      <li className="flex items-start">
        <span className="mr-2 text-blue-600">•</span>
        <p className="text-gray-700">
          <span className="font-semibold">Video Proctoring:</span>Persons and all other objects (Cell Phones , Books ..etc)
        </p>
      </li>
      <li className="flex items-start">
        <span className="mr-2 text-blue-600">•</span>
        <p className="text-gray-700">
          <span className="font-semibold">Audio Proctoring:</span> Based on audio input, and the threshold value for detection can be adjusted as per requirements.
        </p>
      </li>
      <li className="flex items-start">
        <span className="mr-2 text-blue-600">•</span>
        <p className="text-gray-700">
          <span className="font-semibold">Head Movement Detection:</span> Sensitivity is intentionally low to prevent unnecessary exam terminations or false positives.
        </p>
      </li>

      {errorMessage && (
        <li className="flex items-start">
          <span className="mr-2 text-blue-600">•</span>
          <p className="text-red-700">
            <span className="font-semibold">Errors:</span> {errorMessage}
            <p className="text-red-500">Make sure you are not using mic & camera on another app or website</p>
          </p>
        </li>
      )}
    </ul>

    <div className="mt-4 max-w-md space-y-3">
      <p className="flex items-center text-md font-medium text-gray-800">
        <Camera className="mr-3 h-5 w-5 text-blue-600" />
        Faces detected: <span className="ml-2 font-bold text-blue-600">{faceCount}</span>
      </p>

      <p className="flex items-center text-md font-medium text-gray-800">
        <Crosshair className="mr-3 h-5 w-5 text-blue-600" />
        Head Position:
        <span className={`ml-2 font-bold ${headMovementDetected ? 'text-yellow-600' : 'text-green-600'}`}>
          {headMovementDetected ? 'Turned' : 'Facing'}
        </span>
      </p>

      <p className="flex items-center text-md font-medium text-gray-800">
        <Volume2 className="mr-3 h-5 w-5 text-blue-600" />
        Talking:
        <span className={`ml-2 font-bold ${isTalking ? 'text-green-600' : 'text-yellow-600'}`}>
          {isTalking ? 'Yes' : 'No'}
        </span>
      </p>

      {detectedObjects.length > 0 && (
        <div className="mt-6">
          <h3 className="flex items-center text-lg font-semibold text-gray-800 mb-2">
            <Box className="mr-2 h-5 w-5 text-blue-600" />
            Other Detected Objects
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {detectedObjects.map((obj, index) => (
              <div
                key={`${obj.class}-${index}`}
                className="flex items-center p-2 bg-gray-50 rounded-md"
              >
                <span className="text-gray-700">{obj.class}</span>
                <span className="ml-auto font-medium text-blue-600">{obj.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
</div>

);
};

export default HeadMovements;