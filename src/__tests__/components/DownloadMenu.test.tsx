import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DownloadMenu } from '@/components/DownloadMenu';

describe('DownloadMenu', () => {
  it('renders a single Download button that downloads a zip when skill format is disabled', () => {
    const onDownload = vi.fn();
    render(
      <DownloadMenu
        enableSkillFormat={false}
        isLoading={false}
        name='my-agent'
        onDownload={onDownload}
        testId='download'
      />,
    );

    const button = screen.getByTestId('download');
    expect(button).toHaveTextContent('Download');
    expect(screen.queryByTestId('download-skill')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith('zip');
  });

  it('opens a menu offering both zip and skill downloads when skill format is enabled', () => {
    const onDownload = vi.fn();
    render(
      <DownloadMenu
        enableSkillFormat
        isLoading={false}
        name='my-skill'
        onDownload={onDownload}
        testId='download'
      />,
    );

    fireEvent.click(screen.getByTestId('download'));

    fireEvent.click(screen.getByTestId('download-skill'));
    expect(onDownload).toHaveBeenCalledWith('skill');

    fireEvent.click(screen.getByTestId('download'));
    fireEvent.click(screen.getByTestId('download-zip'));
    expect(onDownload).toHaveBeenCalledWith('zip');
  });

  it('disables the control while a download is in flight', () => {
    render(
      <DownloadMenu
        enableSkillFormat
        isLoading
        name='my-skill'
        onDownload={vi.fn()}
        testId='download'
      />,
    );

    const trigger = screen.getByTestId('download');
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('Downloading…');
  });
});
