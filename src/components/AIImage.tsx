import React, { useState, useEffect } from 'react';
import { generateImage } from '../services/geminiService';
import { Loader2, Image as ImageIcon } from 'lucide-react';

interface AIImageProps {
  prompt: string;
  className?: string;
}

export const AIImage: React.FC<AIImageProps> = ({ prompt, className = "" }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchImage = async () => {
      setLoading(true);
      try {
        const imageUrl = await generateImage(prompt);
        if (isMounted) setUrl(imageUrl);
      } catch (error) {
        console.error("Failed to load AI image:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchImage();
    return () => { isMounted = false; };
  }, [prompt]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-[#F0F4F8] ${className}`}>
        <Loader2 className="w-6 h-6 text-[#4A90E2] animate-spin" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-[#F0F4F8] ${className}`}>
        <ImageIcon className="w-6 h-6 text-[#D1D9E6]" />
      </div>
    );
  }

  return (
    <img 
      src={url} 
      alt={prompt} 
      className={`object-cover ${className}`} 
      referrerPolicy="no-referrer" 
    />
  );
};
