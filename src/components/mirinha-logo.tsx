
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

      <text x="40" y="62" className="mirinha-script">
        <tspan>M</tspan>
        <tspan>irinha</tspan>
      </text>

      {/* Flame for the dot on the 'i' */}
      <path 
        className="flame"
        d="M 98.5 32.5 C 98.5 32.5, 100 30, 100 28.5 C 100 27, 97 27, 97 28.5 C 97 30, 98.5 32.5, 98.5 32.5 Z"
      />
    </svg>
  );
}
