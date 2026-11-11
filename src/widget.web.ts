// Web is only used for screen previews: no home-screen widget there.
export const widgetShowsNames = (): boolean => true;
export const updateWidget = async (_db: unknown): Promise<void> => {};
export const registerWidget = (): void => {};
