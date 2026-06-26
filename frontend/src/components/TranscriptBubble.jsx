import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const senderKeyByRole = {
  user: 'customer',
  ai: 'agent',
  assistant: 'agent',
  agent: 'staff',
  staff: 'staff'
};

function TranscriptBubble({ message }) {
  const { t } = useTranslation();
  const isCustomer = message.role === 'user' || message.sender === 'user';
  const sender = message.sender || (message.role === 'assistant' ? 'ai' : message.role);
  const senderKey = senderKeyByRole[sender] || 'agent';
  const senderLabel = t(`components.transcript.senders.${senderKey}`, senderKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[86%] rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm ${
          isCustomer
            ? 'rounded-br-sm border-teal-500 bg-teal-700 text-white'
            : 'rounded-bl-sm border-slate-200 bg-white text-slate-800'
        }`}
      >
        <div className={`mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${
          isCustomer ? 'text-teal-100' : 'text-teal-700'
        }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current/30">
            <span className="h-2.5 w-1.5 rounded-full border border-current" />
          </span>
          {t('components.transcript.label', 'Voice transcript')} - {senderLabel}
        </div>
        <p>{message.content}</p>
      </div>
    </motion.div>
  );
}

export default TranscriptBubble;
