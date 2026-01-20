'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Camera, AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';

interface CameraCaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUri: string | null) => void;
  isProcessing: boolean;
}

export default function CameraCaptureSheet({
  isOpen,
  onClose,
  onCapture,
  isProcessing,
}: CameraCaptureSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const { toast } = useToast();

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, []);

  useEffect(() => {
    const getCameraPermission = async () => {
      if (!isOpen) {
        stopCameraStream();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        toast({
            variant: 'destructive',
            title: 'Funcionalidade não suportada',
            description: 'O seu navegador não suporta o acesso à câmara.',
        });
        setHasCameraPermission(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', // Prioritize back camera
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            } 
        });
        streamRef.current = stream;
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Acesso à Câmara Negado',
          description: 'Por favor, autorize o acesso à câmara nas definições do seu navegador.',
        });
      }
    };

    getCameraPermission();

    return () => {
      stopCameraStream();
    };
  }, [isOpen, toast, stopCameraStream]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    if(context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL('image/jpeg', 0.85);
        onCapture(dataUri);
    } else {
        toast({ variant: 'destructive', title: 'Erro de Captura', description: 'Não foi possível capturar a imagem.'})
    }
  };

  const handleClose = () => {
    stopCameraStream();
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-2xl h-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Capturar Romaneio com a Câmera</SheetTitle>
          <SheetDescription>
            Posicione o documento de forma que fique bem iluminado e legível.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-grow flex items-center justify-center relative overflow-hidden my-4 bg-muted rounded-md">
            {hasCameraPermission === null && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p>A iniciar câmara...</p>
                </div>
            )}
            {hasCameraPermission === false && (
                <Alert variant="destructive" className="m-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Acesso à Câmara Bloqueado</AlertTitle>
                    <AlertDescription>
                        É necessário permitir o acesso à câmara para usar esta funcionalidade. Por favor, verifique as permissões do seu navegador.
                    </AlertDescription>
                </Alert>
            )}
            {hasCameraPermission && (
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    autoPlay
                    muted
                    playsInline
                />
            )}
            <canvas ref={canvasRef} className="hidden" />
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button onClick={handleCapture} disabled={!hasCameraPermission || isProcessing}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Camera className="mr-2 h-4 w-4" />}
            Tirar Foto e Analisar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
