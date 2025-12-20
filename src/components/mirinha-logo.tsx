
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
          .restaurante-script {
            font-family: 'Inter', 'sans-serif';
            font-size: 14px;
            font-weight: 500;
            fill: currentColor;
            letter-spacing: 0.5px;
            text-anchor: middle;
          }
          .mirinha-script {
            font-family: 'Inter', serif;
            font-size: 42px;
            font-weight: 600;
            font-style: italic;
            fill: currentColor;
            text-anchor: middle;
          }
           .cloche-path {
            fill: none;
            stroke: currentColor;
            stroke-width: 1.5;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
           .cloche-handle {
            fill: currentColor;
            stroke: none;
           }
        `}
      </style>
      
      <text x="100" y="22" className="restaurante-script">Restaurante da</text>
      <line x1="48" y1="28" x2="152" y2="28" stroke="currentColor" strokeWidth="1" />

      {/* Cloche (Bandeja) */}
       <g transform="translate(48, 17)">
        <path className="cloche-path" d="M 0 18 A 12 12 0 0 1 24 18 Z" />
        <rect x="9.5" y="1" width="5" height="3" rx="1" className="cloche-handle" />
        <line className="cloche-path" x1="-2" y1="19" x2="26" y2="19" />
      </g>
      
      <text x="100" y="65" className="mirinha-script">Mirinha</text>
      
    </svg>
  );
}
