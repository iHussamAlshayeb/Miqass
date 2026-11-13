import React from 'react';
import { Delete } from 'lucide-react';
import { applyKey } from './posShared';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

const Keypad = ({ value, onChange, compact = false }) => (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
        {KEYS.map((key) => (
            <button
                key={key}
                type="button"
                onClick={() => onChange(applyKey(value, key))}
                className={`flex items-center justify-center rounded-xl border border-slate-200 bg-white font-bold text-slate-800 shadow-sm transition active:scale-95 active:bg-slate-100 ${compact ? 'h-12 text-xl' : 'h-16 text-2xl'}`}
                aria-label={key === 'back' ? 'حذف' : key}
            >
                {key === 'back' ? <Delete size={22} /> : key}
            </button>
        ))}
    </div>
);

export default Keypad;
