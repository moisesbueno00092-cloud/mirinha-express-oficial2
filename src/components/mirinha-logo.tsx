
import { cn } from "@/lib/utils";

export default function MirinhaLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 70"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("font-headline", className)}
    >
      <style>
        {`
          .mirinha-script {
            font-family: 'Brush Script MT', 'Brush Script Std', 'cursive';
            font-size: 42px;
            fill: currentColor;
          }
          .restaurante-script {
            font-family: 'Inter', 'sans-serif';
            font-size: 14px;
            font-weight: 500;
            fill: currentColor;
            letter-spacing: 0.5px;
          }
          .cloche {
            fill: currentColor;
          }
        `}
      </style>
      
      {/* "Restaurante da" text with underline */}
      <text x="50" y="22" className="restaurante-script">Restaurante da</text>
      <line x1="48" y1="28" x2="162" y2="28" stroke="currentColor" strokeWidth="1" />

      {/* "Mirinha" text */}
      <text x="40" y="62" className="mirinha-script">
        <tspan>Mirinha</tspan>
      </text>

      {/* Cloche Icon */}
      <g className="cloche" transform="translate(13, 27) scale(0.9)">
        <path d="M 25 10 A 15 15 0 0 0 10 25 L 40 25 A 15 15 0 0 0 25 10 Z" />
        <rect x="22" y="5" width="6" height="5" rx="2" />
        <rect x="8" y="26" width="34" height="2" rx="1" />
      </g>
    </svg>
  );
}
