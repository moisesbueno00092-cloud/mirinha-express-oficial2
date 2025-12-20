
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
           .flame {
            fill: hsl(var(--primary));
            filter: drop-shadow(0 0 2px hsl(var(--primary) / 0.8));
          }
        `}
      </style>
      
      <text x="5" y="22" className="restaurante-script">Restaurante da</text>
      
      {/* Stylized "M" using fork and knife shapes */}
      <g transform="translate(10, 35) scale(0.8)">
        {/* Fork */}
        <path d="M 12 28 L 12 10 C 12 5, 10 2, 5 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="12" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="12" y1="16" x2="8" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        
        {/* Knife */}
        <path d="M 18 28 L 18 2 C 23 2, 25 5, 25 10 L 25 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      
      <text x="40" y="62" className="mirinha-script">
        <tspan>irinha</tspan>
      </text>

      {/* Flame for the dot on the 'i' */}
      <path 
        className="flame"
        d="M 66.5 32.5 C 66.5 32.5, 68 30, 68 28.5 C 68 27, 65 27, 65 28.5 C 65 30, 66.5 32.5, 66.5 32.5 Z"
      />
    </svg>
  );
}
