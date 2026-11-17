import { setAuthBridge, type AuthBridge } from '@/services/api';

import { FileOpenError, openPrivateFile, safeFileName, statusOfDownloadError } from './private-file';
import type { ResourceFile } from './resource-types';

/*
 * The native modules are replaced (no real download, no real viewer); the
 * auth bridge is the real seam the HTTP client uses.
 */
const mockDownload = jest.fn();
const mockCanPreview = jest.fn();
const mockPreview = jest.fn();
const mockDeleted: string[] = [];
const mockCreated: string[] = [];
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
    create() {
      mockCreated.push(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    static downloadFileAsync = (...args: unknown[]) => mockDownload(...args);
    canPreview = (...args: unknown[]) => mockCanPreview(...args);
    preview = (...args: unknown[]) => mockPreview(...args);
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } } };
});
const mockShare = jest.fn();
const mockShareAvailable = jest.fn();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockShareAvailable(),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));

const FILE: ResourceFile = { id: 'f1', fileName: 'أحكام/التجويد.pdf', mimeType: 'application/pdf', size: 1000, url: '/api/files/f1' };
let token = 'access-1';
const bridge: AuthBridge & { refresh: jest.Mock; onSessionEnded: jest.Mock } = {
  getAccessToken: () => token,
  refresh: jest.fn(),
  onSessionEnded: jest.fn(),
};

beforeEach(() => {
  token = 'access-1';
  mockDownload.mockReset();
  mockCanPreview.mockReset().mockResolvedValue(true);
  mockPreview.mockReset().mockResolvedValue(undefined);
  mockShare.mockReset().mockResolvedValue(undefined);
  mockShareAvailable.mockReset().mockResolvedValue(true);
  bridge.refresh.mockReset();
  bridge.onSessionEnded.mockReset();
  mockDeleted.length = 0;
  mockCreated.length = 0;
  setAuthBridge(bridge);
});
afterAll(() => setAuthBridge(null));

const local = (uri = 'file:///cache/resource-files/f1/x.pdf') => ({
  uri,
  canPreview: (...a: unknown[]) => mockCanPreview(...a),
  preview: (...a: unknown[]) => mockPreview(...a),
});
const kindOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof FileOpenError ? e.kind : 'other';
  }
};

describe('authenticated download', () => {
  it('sends the token ONLY in the Authorization header, to the API URL, into the cache folder', async () => {
    mockDownload.mockResolvedValue(local());
    await openPrivateFile(FILE, 'أحكام التجويد');
    const [url, destination, options] = mockDownload.mock.calls[0]!;
    expect(url).toMatch(/\/api\/files\/f1$/);
    expect(url).not.toMatch(/access-1|token/i);
    expect(options).toEqual({ headers: { Authorization: 'Bearer access-1' }, idempotent: true });
    expect((destination as { uri: string }).uri).toBe('file:///cache/resource-files/f1/أحكام_التجويد.pdf');
    // One file at a time: the previous copies are removed first
    expect(mockDeleted).toEqual(['file:///cache/resource-files']);
  });

  it('opens it in the platform viewer with its MIME type and title', async () => {
    mockDownload.mockResolvedValue(local());
    await openPrivateFile(FILE, 'أحكام التجويد');
    expect(mockCanPreview).toHaveBeenCalledWith({ mimeType: 'application/pdf' });
    expect(mockPreview).toHaveBeenCalledWith({ title: 'أحكام التجويد', mimeType: 'application/pdf' });
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('no viewer: the system share sheet; nothing at all: «noViewer»', async () => {
    mockDownload.mockResolvedValue(local());
    mockCanPreview.mockResolvedValue(false);
    await openPrivateFile(FILE, 'أ');
    expect(mockShare).toHaveBeenCalledWith('file:///cache/resource-files/f1/x.pdf', { mimeType: 'application/pdf', dialogTitle: 'أ' });
    mockShareAvailable.mockResolvedValue(false);
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('noViewer');
  });

  it('401: ONE refresh, then a retry with the NEW token', async () => {
    mockDownload.mockRejectedValueOnce(new Error('UnableToDownload: HTTP 401')).mockResolvedValueOnce(local());
    bridge.refresh.mockImplementation(async () => {
      token = 'access-2';
      return 'renewed';
    });
    await openPrivateFile(FILE, 'أ');
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(mockDownload.mock.calls[1]![2]).toEqual({ headers: { Authorization: 'Bearer access-2' }, idempotent: true });
  });

  it('refresh refused: the session ends («expired»), no second download', async () => {
    mockDownload.mockRejectedValue(new Error('HTTP 401'));
    bridge.refresh.mockResolvedValue('expired');
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('expired');
    expect(bridge.onSessionEnded).toHaveBeenCalledWith('expired');
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('refresh failing on the network is «offline», never a sign-out', async () => {
    mockDownload.mockRejectedValue(new Error('HTTP 401'));
    bridge.refresh.mockRejectedValue(new TypeError('Network request failed'));
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('offline');
    expect(bridge.onSessionEnded).not.toHaveBeenCalled();
  });

  it('404 / 403 (deleted, or no longer allowed): «unavailable»; no status: «offline»; 500: «unknown»', async () => {
    mockDownload.mockRejectedValueOnce(new Error('HTTP 404'));
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('unavailable');
    mockDownload.mockRejectedValueOnce(new Error('HTTP 403'));
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('unavailable');
    mockDownload.mockRejectedValueOnce(new Error('The Internet connection appears to be offline.'));
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('offline');
    mockDownload.mockRejectedValueOnce(new Error('HTTP 500'));
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('unknown');
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('signed out (no token): nothing is requested', async () => {
    token = '' as string;
    setAuthBridge({ ...bridge, getAccessToken: () => null });
    expect(await kindOf(openPrivateFile(FILE, 'أ'))).toBe('expired');
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('safe cache names; the download status from the native error', () => {
    expect(safeFileName({ id: 'f1', fileName: '../a:b*.pdf' })).toBe('.._a_b_.pdf');
    expect(safeFileName({ id: 'f1', fileName: '..' })).toBe('file-f1');
    expect(statusOfDownloadError(new Error('UnableToDownload: HTTP 404'))).toBe(404);
    expect(statusOfDownloadError(new Error('timeout'))).toBeNull();
  });
});
