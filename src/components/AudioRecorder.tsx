import { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { transcribeAudio } from '@/src/services/gemini';

interface AudioRecorderProps {
  onTranscription: (text: string) => void;
}

export default function AudioRecorder({ onTranscription }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        processAudio(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const text = await transcribeAudio(base64Data);
          onTranscription(text || '');
        } catch (err: any) {
          const msg = err.message || String(err);
          if (msg === 'LIMITE_EXCEDIDO') {
            alert('Você atingiu o limite diário de uso da IA. Seu limite será renovado amanhã!');
          } else if (msg === 'LIMITE_COTA_API') {
            alert('A cota compartilhada da IA foi atingida. Tente configurar sua própria chave nas configurações para continuar.');
          } else if (msg === 'IA_SOBRECARREGADA') {
            alert('A IA está sobrecarregada no momento. Por favor, tente novamente em alguns instantes.');
          } else {
            console.error('Transcription error:', err);
            alert('Erro na transcrição do áudio.');
          }
        }
      };
    } catch (err) {
      console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!isRecording ? (
        <button 
          onClick={startRecording}
          disabled={isTranscribing}
          className="flex items-center justify-center w-10 h-10 hover:bg-red-500/10 text-red-400 rounded-xl transition-all disabled:opacity-50 group border border-red-500/10"
          title={isTranscribing ? "Processando..." : "Gravar"}
        >
          {isTranscribing ? <Loader2 className="animate-spin" size={18} /> : <Mic size={18} className="group-hover:scale-110 transition-transform" />}
        </button>
      ) : (
        <button 
          onClick={stopRecording}
          className="flex items-center justify-center w-10 h-10 bg-red-600/20 text-red-500 rounded-xl animate-pulse border border-red-500/20"
          title="Parar Gravação"
        >
          <Square size={16} fill="currentColor" />
        </button>
      )}
    </div>
  );
}
