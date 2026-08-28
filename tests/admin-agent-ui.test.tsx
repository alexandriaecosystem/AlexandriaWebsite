import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '../src/app/AppShell';
import { AdminAgentPanel } from '../src/components/AdminAgentPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import type { AdminAgentRequest, AdminAgentResponse } from '../src/agent/agent-client';

afterEach(() => cleanup());

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPanel(requestAgent: (request: AdminAgentRequest) => Promise<AdminAgentResponse>) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<><AdminAgentPanel requestAgent={requestAgent} /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('global assistant mounting', () => {
  it('is mounted by the authenticated app shell', () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>dashboard body</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByRole('button', { name: 'Open AI admin assistant' })).toBeInTheDocument();
  });
});

describe('assistant interaction', () => {
  it('handles navigation commands locally without calling the model', async () => {
    const requestAgent = vi.fn();
    renderPanel(requestAgent);
    fireEvent.click(screen.getByRole('button', { name: 'Open AI admin assistant' }));
    fireEvent.change(screen.getByLabelText('Message AI admin assistant'), { target: { value: 'Go to analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/analytics');
    expect(requestAgent).not.toHaveBeenCalled();
  });

  it('sends non-navigation instructions to the agent with page context', async () => {
    const requestAgent = vi.fn().mockResolvedValue({ kind: 'message', message: 'There are 6 verified Telegram VIP members.' });
    renderPanel(requestAgent);
    fireEvent.click(screen.getByRole('button', { name: 'Open AI admin assistant' }));
    fireEvent.change(screen.getByLabelText('Message AI admin assistant'), { target: { value: 'How many Telegram VIP members do we have?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('There are 6 verified Telegram VIP members.')).toBeInTheDocument();
    expect(requestAgent).toHaveBeenCalledWith(expect.objectContaining({
      instruction: 'How many Telegram VIP members do we have?',
      context: expect.objectContaining({ pathname: '/', page: 'dashboard', language: 'en' }),
    }));
  });

  it('requires explicit confirmation before executing a write action', async () => {
    const requestAgent = vi.fn()
      .mockResolvedValueOnce({
        kind: 'confirmation_required',
        message: 'Confirm knowledge record creation.',
        confirmationToken: 'signed-token',
        tool: 'create_knowledge_record',
        preview: { title: 'Alexandria Security FAQ', language: 'en', status: 'PENDING' },
      })
      .mockResolvedValueOnce({ kind: 'tool_result', message: 'Knowledge record created.', tool: 'create_knowledge_record', result: { id: 'doc-1' } });
    renderPanel(requestAgent);
    fireEvent.click(screen.getByRole('button', { name: 'Open AI admin assistant' }));
    fireEvent.change(screen.getByLabelText('Message AI admin assistant'), { target: { value: 'Create Alexandria Security FAQ and leave it pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('dialog', { name: 'Confirm admin action' })).toBeInTheDocument();
    expect(screen.getByText('Alexandria Security FAQ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(requestAgent).toHaveBeenCalledTimes(2));
    expect(requestAgent.mock.calls[1][0]).toEqual(expect.objectContaining({
      confirmation: { token: 'signed-token', tool: 'create_knowledge_record' },
    }));
    expect(await screen.findByText('Knowledge record created.')).toBeInTheDocument();
  });
});
