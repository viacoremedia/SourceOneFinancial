import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
    X,
    Check,
    Undo2,
    Redo2,
    Pencil,
    Square,
    Type,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AnnotationEditorProps {
    imageSrc: string;
    onSave: (annotatedImage: string) => void;
    onCancel: () => void;
}

type Tool = 'select' | 'pen' | 'rect' | 'arrow' | 'text' | 'eraser';

interface DrawAction {
    tool: Tool;
    points?: { x: number; y: number }[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    color: string;
    width: number;
    text?: string;
}

const COLORS = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#3b82f6', // Blue
    '#a855f7', // Purple
    '#ec4899', // Pink
    '#000000', // Black
    '#ffffff', // White
];

export function AnnotationEditor({ imageSrc, onSave, onCancel }: AnnotationEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ef4444');
    const [lineWidth, setLineWidth] = useState(3);
    const [history, setHistory] = useState<DrawAction[]>([]);
    const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

    // Text input state
    const [textInput, setTextInput] = useState<{ x: number, y: number, text: string } | null>(null);

    // Initial Image Load
    useEffect(() => {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            setImageObj(img);
            setImageLoaded(true);
            resizeCanvas();
        };
    }, [imageSrc]);

    // Handle Container Resize
    useEffect(() => {
        if (!containerRef.current || !imageLoaded) return;

        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });

        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, [imageLoaded, imageObj]);

    // Draw Loop
    useEffect(() => {
        if (!imageLoaded || !imageObj || !canvasRef.current) return;
        renderCanvas();
    }, [history, currentAction, imageLoaded, imageObj]);

    const resizeCanvas = () => {
        if (!containerRef.current || !canvasRef.current || !imageObj) return;
        const container = containerRef.current;
        const canvas = canvasRef.current;

        const padding = 16;
        const availableWidth = container.clientWidth - padding * 2;
        const availableHeight = container.clientHeight - padding * 2;

        const containerAspect = availableWidth / availableHeight;
        const imageAspect = imageObj.width / imageObj.height;

        let renderWidth, renderHeight;

        if (containerAspect > imageAspect) {
            renderHeight = availableHeight;
            renderWidth = renderHeight * imageAspect;
        } else {
            renderWidth = availableWidth;
            renderHeight = renderWidth / imageAspect;
        }

        canvas.width = imageObj.width;
        canvas.height = imageObj.height;

        canvas.style.width = `${renderWidth}px`;
        canvas.style.height = `${renderHeight}px`;

        renderCanvas();
    };

    const renderCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || !imageObj) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageObj, 0, 0);

        [...history, currentAction].forEach(action => {
            if (!action) return;
            ctx.beginPath();
            ctx.strokeStyle = action.color;
            ctx.lineWidth = action.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (action.tool === 'pen' || action.tool === 'eraser') {
                if (action.tool === 'eraser') {
                    ctx.strokeStyle = '#ffffff';
                }

                if (action.points && action.points.length > 0) {
                    ctx.moveTo(action.points[0].x, action.points[0].y);
                    action.points.forEach(p => ctx.lineTo(p.x, p.y));
                    ctx.stroke();
                }
                ctx.globalCompositeOperation = 'source-over';
            } else if (action.tool === 'rect') {
                if (action.start && action.end) {
                    const w = action.end.x - action.start.x;
                    const h = action.end.y - action.start.y;
                    ctx.strokeRect(action.start.x, action.start.y, w, h);
                }
            } else if (action.tool === 'arrow') {
                if (action.start && action.end) {
                    drawArrow(ctx, action.start.x, action.start.y, action.end.x, action.end.y);
                }
            } else if (action.tool === 'text') {
                if (action.start && action.text) {
                    ctx.fillStyle = action.color;
                    ctx.font = `${action.width * 5 + 10}px sans-serif`;
                    ctx.fillText(action.text, action.start.x, action.start.y);
                }
            }
        });
    };

    const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
        const headLength = 20;
        const dx = toX - fromX;
        const dy = toY - fromY;
        const angle = Math.atan2(dy, dx);

        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    };

    const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (tool === 'text') return;
        const { x, y } = getCoords(e);

        setIsDrawing(true);
        if (tool === 'pen' || tool === 'eraser') {
            setCurrentAction({
                tool,
                color,
                width: lineWidth,
                points: [{ x, y }]
            });
        } else {
            setCurrentAction({
                tool,
                color,
                width: lineWidth,
                start: { x, y },
                end: { x, y }
            });
        }
    };

    const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !currentAction) return;
        const { x, y } = getCoords(e);

        if (tool === 'pen' || tool === 'eraser') {
            setCurrentAction(prev => prev ? {
                ...prev,
                points: [...(prev.points || []), { x, y }]
            } : null);
        } else {
            setCurrentAction(prev => prev ? {
                ...prev,
                end: { x, y }
            } : null);
        }
    };

    const handleEnd = () => {
        if (!isDrawing || !currentAction) return;
        setIsDrawing(false);
        setHistory(prev => [...prev, currentAction]);
        setRedoStack([]);
        setCurrentAction(null);
    };

    const handleCanvasAppClick = (e: React.MouseEvent) => {
        if (tool !== 'text') return;
        const { x, y } = getCoords(e);
        setTextInput({ x, y, text: '' });
    };

    const confirmText = () => {
        if (!textInput || !textInput.text.trim()) {
            setTextInput(null);
            return;
        }

        const action: DrawAction = {
            tool: 'text',
            color,
            width: lineWidth,
            start: { x: textInput.x, y: textInput.y },
            text: textInput.text
        };

        setHistory(prev => [...prev, action]);
        setTextInput(null);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const newHistory = [...history];
        const popped = newHistory.pop();
        setHistory(newHistory);
        if (popped) setRedoStack(prev => [...prev, popped]);
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const newRedo = [...redoStack];
        const popped = newRedo.pop();
        setRedoStack(newRedo);
        if (popped) setHistory(prev => [...prev, popped]);
    };

    const handleSave = () => {
        if (!canvasRef.current) return;
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
        onSave(dataUrl);
    };

    return (
        <div className="flex flex-col w-full h-full overflow-hidden bg-background">
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-2 gap-2 border-b border-border bg-card shadow-sm shrink-0">
                <div className="flex items-center justify-between w-full sm:w-auto">
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={onCancel} title="Cancel" className="px-2">
                            <X className="h-4 w-4 mr-1" />
                            <span className="text-xs">Cancel</span>
                        </Button>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={handleUndo} disabled={history.length === 0} title="Undo">
                            <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo">
                            <Redo2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-1 bg-muted p-1 rounded-lg overflow-x-auto scrollbar-hide w-full sm:w-auto justify-start border border-border/50">
                    {[
                        { id: 'pen', icon: Pencil, label: 'Pen' },
                        { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
                        { id: 'rect', icon: Square, label: 'Rectangle' },
                        { id: 'text', icon: Type, label: 'Text' },
                    ].map(t => (
                        <Button
                            key={t.id}
                            variant={tool === t.id ? 'secondary' : 'ghost'}
                            size="icon"
                            className={cn("h-8 w-8 shrink-0 rounded-md", tool === t.id && "bg-white shadow-sm")}
                            onClick={() => setTool(t.id as Tool)}
                            title={t.label}
                        >
                            <t.icon className="h-4 w-4" />
                        </Button>
                    ))}

                    <div className="w-px h-6 bg-border mx-1 shrink-0" />

                    {/* Color Picker */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 p-1.5 shrink-0 hover:bg-transparent"
                                style={{ color }}
                            >
                                <div className="w-full h-full rounded-full border border-border shadow-sm" style={{ backgroundColor: color }} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] p-2" align="center">
                            <div className="grid grid-cols-4 gap-2">
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        className={cn(
                                            "w-6 h-6 rounded-full border border-border hover:scale-110 transition-transform",
                                            color === c && "ring-2 ring-offset-2 ring-primary"
                                        )}
                                        style={{ backgroundColor: c }}
                                        onClick={() => setColor(c)}
                                    />
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Width Slider */}
                    <div className="w-24 px-2 shrink-0 hidden sm:block">
                        <Slider
                            value={[lineWidth]}
                            min={1}
                            max={20}
                            step={1}
                            onValueChange={([v]) => setLineWidth(v)}
                        />
                    </div>
                </div>

                <div className="flex justify-end mt-1 sm:mt-0">
                    <Button onClick={handleSave} size="sm" className="w-full sm:w-auto gap-2 bg-primary">
                        <Check className="h-4 w-4" /> Save
                    </Button>
                </div>
            </div>

            {/* Canvas Area */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden relative bg-neutral-100 flex items-center justify-center p-4 cursor-crosshair"
            >
                {!imageLoaded && <div className="text-muted-foreground animate-pulse">Loading image...</div>}

                <canvas
                    ref={canvasRef}
                    className="shadow-2xl border bg-white"
                    onMouseDown={handleStart}
                    onMouseMove={handleMove}
                    onMouseUp={handleEnd}
                    onMouseLeave={handleEnd}
                    onTouchStart={handleStart}
                    onTouchMove={handleMove}
                    onTouchEnd={handleEnd}
                    onClick={handleCanvasAppClick}
                />

                {/* Text Input Overlay */}
                {textInput && containerRef.current && canvasRef.current && (
                    <div
                        className="absolute"
                        style={{
                            left: '50%',
                            top: '20%',
                            transform: 'translateX(-50%)'
                        }}
                    >
                        <div className="bg-card p-2 rounded-lg shadow-xl border border-border flex gap-2 animate-in zoom-in-95">
                            <input
                                autoFocus
                                className="bg-transparent border-none outline-none text-sm min-w-[200px]"
                                placeholder="Enter text..."
                                value={textInput.text}
                                onChange={e => setTextInput(prev => prev ? { ...prev, text: e.target.value } : null)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') confirmText();
                                    if (e.key === 'Escape') setTextInput(null);
                                }}
                            />
                            <Button size="sm" onClick={confirmText}>OK</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
