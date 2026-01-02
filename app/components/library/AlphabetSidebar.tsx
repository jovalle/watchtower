import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface AlphabetSidebarProps {
  /** Currently active letter */
  activeLetter?: string;
  /** Letters that have items */
  availableLetters?: string[];
  /** Handler when letter is clicked */
  onLetterClick?: (letter: string) => void;
  /** Handler when letter is hovered (for preview) */
  onLetterHover?: (letter: string | null) => void;
  /** Handler for return to top */
  onReturnToTop?: () => void;
}

const ALPHABET = ["#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

// Magnification settings
const LETTER_HEIGHT = 20; // Fixed base height for calculations
const MAX_SCALE = 1.8; // Maximum scale for the hovered letter
const MAGNIFY_RANGE = 2.5; // Number of letters affected on each side

/**
 * Calculate scale factor based on distance from cursor position.
 * Uses a smooth cosine curve for dock-like magnification.
 */
function getScale(letterIndex: number, cursorIndex: number | null): number {
  if (cursorIndex === null) return 1;

  const distance = Math.abs(letterIndex - cursorIndex);
  if (distance >= MAGNIFY_RANGE) return 1;

  // Smooth cosine falloff
  const t = distance / MAGNIFY_RANGE;
  const scaleFactor = (1 + Math.cos(t * Math.PI)) / 2; // 0 to 1
  return 1 + (MAX_SCALE - 1) * scaleFactor;
}

/**
 * Plex-style alphabetic navigation sidebar with macOS dock magnification.
 */
export function AlphabetSidebar({
  activeLetter,
  availableLetters = ALPHABET,
  onLetterClick,
  onLetterHover,
  onReturnToTop,
}: AlphabetSidebarProps) {
  const [hoveredLetter, setHoveredLetter] = useState<string | null>(null);
  const [isTopHovered, setIsTopHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lettersRef = useRef<HTMLDivElement>(null);
  const lettersTopRef = useRef<number>(0);

  const handleReturnToTop = useCallback(() => {
    if (onReturnToTop) {
      onReturnToTop();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [onReturnToTop]);

  // Calculate cursor index from Y position using FIXED letter height
  const getCursorIndex = useCallback((clientY: number): number | null => {
    const relativeY = clientY - lettersTopRef.current;
    const index = relativeY / LETTER_HEIGHT;

    if (index < -0.5 || index > ALPHABET.length - 0.5) return null;
    return index;
  }, []);

  // Get discrete letter from cursor index
  const getLetterFromIndex = useCallback((index: number | null): string | null => {
    if (index === null) return null;
    const discreteIndex = Math.round(index);
    if (discreteIndex >= 0 && discreteIndex < ALPHABET.length) {
      return ALPHABET[discreteIndex];
    }
    return null;
  }, []);

  // Update position - stores the top position on first interaction
  const updatePosition = useCallback((clientY: number, forceUpdateTop = false) => {
    if (forceUpdateTop || lettersTopRef.current === 0) {
      if (lettersRef.current) {
        lettersTopRef.current = lettersRef.current.getBoundingClientRect().top;
      }
    }

    const index = getCursorIndex(clientY);
    setCursorIndex(index);

    const letter = getLetterFromIndex(index);
    if (letter !== hoveredLetter) {
      setHoveredLetter(letter);
      onLetterHover?.(letter);
    }
  }, [getCursorIndex, getLetterFromIndex, hoveredLetter, onLetterHover]);

  // Reset state
  const resetState = useCallback(() => {
    setIsDragging(false);
    setCursorIndex(null);
    setHoveredLetter(null);
    onLetterHover?.(null);
    lettersTopRef.current = 0;
  }, [onLetterHover]);

  // Handle mouse enter
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    updatePosition(e.clientY, true);
  }, [updatePosition]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      resetState();
    }
  }, [isDragging, resetState]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    updatePosition(e.clientY);
  }, [updatePosition]);

  // Handle mouse down - begin drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientY, true);
  }, [updatePosition]);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    if (lettersRef.current) {
      lettersTopRef.current = lettersRef.current.getBoundingClientRect().top;
    }
    const touch = e.touches[0];
    updatePosition(touch.clientY);
  }, [updatePosition]);

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    updatePosition(touch.clientY);
  }, [isDragging, updatePosition]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (isDragging && hoveredLetter && availableLetters.includes(hoveredLetter)) {
      onLetterClick?.(hoveredLetter);
    }
    resetState();
  }, [isDragging, hoveredLetter, availableLetters, onLetterClick, resetState]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = hoveredLetter ? ALPHABET.indexOf(hoveredLetter) : -1;
    let newIndex = currentIndex;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = Math.min(currentIndex + 1, ALPHABET.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = Math.max(currentIndex - 1, 0);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (hoveredLetter && availableLetters.includes(hoveredLetter)) {
        onLetterClick?.(hoveredLetter);
      }
      return;
    } else {
      return;
    }

    const newLetter = ALPHABET[newIndex];
    setHoveredLetter(newLetter);
    setCursorIndex(newIndex);
    onLetterHover?.(newLetter);
  }, [hoveredLetter, availableLetters, onLetterClick, onLetterHover]);

  // Document-level mouse tracking during drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updatePosition(e.clientY);
    };

    const handleMouseUp = () => {
      if (hoveredLetter && availableLetters.includes(hoveredLetter)) {
        onLetterClick?.(hoveredLetter);
      }
      resetState();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, hoveredLetter, availableLetters, updatePosition, onLetterClick, resetState]);

  const isActive = cursorIndex !== null;

  return (
    <div className="fixed right-4 top-1/2 z-40 -translate-y-1/2" ref={containerRef}>
      <div
        className="flex flex-col items-center rounded-lg bg-black/40 px-1.5 py-2 backdrop-blur-sm"
        style={{ touchAction: 'none' }}
      >
        {/* Return to top button */}
        <button
          onClick={handleReturnToTop}
          onMouseEnter={() => setIsTopHovered(true)}
          onMouseLeave={() => setIsTopHovered(false)}
          className={`flex h-5 w-5 items-center justify-center rounded text-xs font-medium transition-colors mb-1 ${
            isTopHovered
              ? "bg-mango text-black"
              : "text-foreground-secondary hover:text-foreground-primary"
          }`}
          aria-label="Return to top"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <div className="w-full border-t border-white/20 mb-1" />

        {/* Letters container */}
        <div
          ref={lettersRef}
          role="listbox"
          aria-label="Alphabet navigation"
          tabIndex={0}
          className="flex flex-col items-center select-none"
          style={{ cursor: 'pointer' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onKeyDown={handleKeyDown}
        >
          {ALPHABET.map((letter, index) => {
            const isAvailable = availableLetters.includes(letter);
            const isActiveLetter = activeLetter === letter;
            const isHovered = hoveredLetter === letter;
            const scale = getScale(index, cursorIndex);

            return (
              <div
                key={letter}
                className="flex items-center justify-center"
                style={{
                  width: LETTER_HEIGHT,
                  height: LETTER_HEIGHT,
                }}
              >
                <button
                  onClick={() => isAvailable && onLetterClick?.(letter)}
                  disabled={!isAvailable}
                  className={`flex items-center justify-center rounded text-xs font-medium ${
                    isActiveLetter
                      ? "bg-mango text-black"
                      : isHovered && isAvailable
                      ? "bg-white/20 text-foreground-primary"
                      : isAvailable
                      ? "text-foreground-secondary"
                      : "cursor-default text-foreground-muted/30"
                  }`}
                  style={{
                    width: LETTER_HEIGHT,
                    height: LETTER_HEIGHT,
                    transform: `scale(${scale})`,
                    transformOrigin: 'center',
                    transition: isActive ? 'none' : 'transform 150ms ease-out',
                    willChange: isActive ? 'transform' : 'auto',
                  }}
                  aria-label={`Jump to ${letter === "#" ? "numbers" : letter}`}
                >
                  {letter}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover preview tooltip */}
      {(hoveredLetter || isTopHovered) && (
        <div
          className="absolute right-full top-1/2 mr-2 -translate-y-1/2 rounded-lg bg-background-elevated px-3 py-1.5 shadow-lg ring-1 ring-white/10"
          style={{ transition: 'none' }}
        >
          <span className="text-lg font-bold text-foreground-primary">
            {isTopHovered ? "Top" : hoveredLetter === "#" ? "0-9" : hoveredLetter}
          </span>
        </div>
      )}
    </div>
  );
}
