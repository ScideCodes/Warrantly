// Web is only used for screen previews; per-account Google tokens are Android-only.
export default {
  getToken: async (_email: string, _scopes: string[]): Promise<string> => {
    throw new Error('Not available on web');
  },
};
