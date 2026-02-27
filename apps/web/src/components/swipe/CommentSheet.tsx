"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { getComments, postComment, type Comment, type MarketPrice } from "@/lib/api";
import { X, Send, MessageCircle } from "lucide-react";

interface CommentSheetProps {
  market: MarketPrice;
  onClose: () => void;
}

export function CommentSheet({ market, onClose }: CommentSheetProps) {
  const { address } = useAccount();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    getComments(market.globalEventId).then(setComments).catch(() => {});
  }, [market.globalEventId]);

  const handlePost = async () => {
    if (!text.trim() || !address) return;
    setPosting(true);
    try {
      const c = await postComment(market.globalEventId, text.trim(), address);
      setComments((prev) => [c, ...prev]);
      setText("");
    } catch {
      // silently fail
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-terminal-surface border-t border-x border-terminal-border rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-terminal-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-terminal-border">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-terminal-muted" />
            <span className="font-mono text-sm text-terminal-text">{comments.length} comments</span>
          </div>
          <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Market question */}
        <div className="px-4 py-2 bg-terminal-bg border-b border-terminal-border">
          <p className="text-xs text-terminal-muted font-mono line-clamp-2">{market.question}</p>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {comments.length === 0 ? (
            <div className="text-center text-terminal-muted font-mono text-xs py-8">
              No comments yet. Be the first.
            </div>
          ) : (
            comments.map((c) => (
              <div key={c._id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-terminal-border flex items-center justify-center text-xs font-mono text-terminal-muted flex-shrink-0">
                  {c.author.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-bnb">{c.author}</span>
                    <span className="text-xs text-terminal-muted font-mono">
                      {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-terminal-text">{c.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-terminal-border flex gap-2">
          {address ? (
            <>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handlePost()}
                placeholder="Add a comment..."
                className="flex-1 bg-terminal-bg border border-terminal-border rounded-lg px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted focus:outline-none focus:border-bnb font-mono"
                maxLength={280}
              />
              <button
                onClick={handlePost}
                disabled={!text.trim() || posting}
                className="p-2 rounded-lg bg-bnb text-terminal-bg hover:bg-bnb-dark transition-colors disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </>
          ) : (
            <p className="text-xs text-terminal-muted font-mono w-full text-center py-1">
              Connect wallet to comment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
