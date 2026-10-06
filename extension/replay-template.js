(function (root) {
  function replayHook(context) {
    const {
      React, useInfiniteQuery, createOptions, initialStart, videoStartMs,
      progress, isSliding, channelId,
      now = Date.now, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout
    } = context;
    const contextKey = JSON.stringify([initialStart, videoStartMs, channelId]);
    const [displayMs, setDisplayMs] = React.useState(Number.isFinite(progress) ? progress : 0);
    const [startAt, setStartAt] = React.useState(initialStart);
    const [retryTick, setRetryTick] = React.useState(0);
    const control = React.useRef({
      contextKey,
      lastProgress: null, wasSliding: false, flight: null,
      retryAfter: 0, retryTimer: null
    });
    const contextChanged = control.current.contextKey !== contextKey;
    const effectiveStartAt = contextChanged ? initialStart : startAt;
    const effectiveDisplayMs = contextChanged
      ? Number.isFinite(progress) ? progress : 0
      : displayMs;
    const validStart = initialStart !== '0001-01-01T00:00:00Z' &&
      Number.isFinite(Date.parse(initialStart)) && Number.isFinite(videoStartMs);
    const queryOptions = createOptions(effectiveStartAt);
    const queryKey = [...(queryOptions.queryKey || []), 'kcf-replay-buffer-v3'];
    const queryKeyId = JSON.stringify(queryKey);
    const query = useInfiniteQuery({
      ...queryOptions,
      queryKey,
      enabled: Boolean(validStart && channelId && !isSliding),
      maxPages: 24,
      staleTime: Infinity,
      gcTime: 60000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 0
    });
    const params = query.data?.pageParams;
    const lastParam = params && params.length ? params[params.length - 1] : null;
    const aheadMs = lastParam && Number.isFinite(Date.parse(lastParam.start_time))
      ? Date.parse(lastParam.start_time) - videoStartMs - progress
      : null;

    React.useEffect(() => {
      const state = control.current;
      if (state.contextKey !== contextKey) {
        state.contextKey = contextKey;
        state.lastProgress = Number.isFinite(progress) ? progress : null;
        state.wasSliding = Boolean(isSliding);
        state.flight = null;
        state.retryAfter = 0;
        clearScheduledTimeout(state.retryTimer);
        state.retryTimer = null;
        setStartAt(initialStart);
        setDisplayMs(Number.isFinite(progress) ? progress : 0);
        return;
      }
      if (!Number.isFinite(progress)) return;
      const previous = state.lastProgress;
      const seeking = previous !== null && (progress < previous || progress - previous > 2000);
      if (isSliding) {
        state.wasSliding = true;
        state.lastProgress = progress;
      } else {
        if (state.wasSliding || seeking) {
          state.wasSliding = false;
          state.lastProgress = progress;
          state.retryAfter = 0;
          clearScheduledTimeout(state.retryTimer);
          state.retryTimer = null;
          if (Number.isFinite(videoStartMs))
            setStartAt(new Date(videoStartMs + Math.max(0, progress - 2500)).toISOString());
          setDisplayMs(progress);
          return;
        } else if (progress - effectiveDisplayMs >= 250) {
          setDisplayMs(progress);
        }
        state.lastProgress = progress;
      }

      const key = queryKeyId;
      const initialRetry = !query.data && query.isError;
      if (initialRetry && state.flight === null && state.retryAfter === 0 && !state.retryTimer) {
        state.retryAfter = now() + 3000;
        state.retryTimer = scheduleTimeout(() => {
          state.retryTimer = null;
          setRetryTick(value => value + 1);
        }, 3000);
        return;
      }
      if (!validStart || !channelId || isSliding || query.isFetching ||
          (!initialRetry && query.hasNextPage !== true) ||
          (!initialRetry && (!Number.isFinite(aheadMs) || aheadMs >= 15000)) ||
          state.flight?.key === key || now() < state.retryAfter) return;

      const ticket = { key };
      state.flight = ticket;
      let request;
      try {
        request = initialRetry
          ? query.refetch({ cancelRefetch: false })
          : query.fetchNextPage({ cancelRefetch: false });
      } catch {
        request = Promise.reject();
      }
      Promise.resolve(request).then(result => {
        if (state.flight !== ticket) return;
        if (result?.isError) state.retryAfter = now() + 3000;
        else state.retryAfter = 0;
      }).catch(() => {
        if (state.flight === ticket) state.retryAfter = now() + 3000;
      }).finally(() => {
        if (state.flight !== ticket) return;
        state.flight = null;
        if (state.retryAfter) {
          clearScheduledTimeout(state.retryTimer);
          state.retryTimer = scheduleTimeout(() => {
            state.retryTimer = null;
            setRetryTick(value => value + 1);
          }, Math.max(0, state.retryAfter - now()));
        } else if (state.retryTimer) {
          clearScheduledTimeout(state.retryTimer);
          state.retryTimer = null;
        }
        setRetryTick(value => value + 1);
      });
    }, [contextKey, effectiveDisplayMs, initialStart, progress, isSliding, validStart, channelId,
      query.data, query.fetchNextPage, query.refetch, query.hasNextPage,
      query.isError, query.isFetching, aheadMs, queryKeyId, retryTick]);

    React.useEffect(() => {
      const state = control.current;
      const metrics = {
        version: 3,
        videoMs: Number.isFinite(progress) ? progress : null,
        displayMs: Number.isFinite(effectiveDisplayMs) ? effectiveDisplayMs : null,
        bufferMs: Number.isFinite(aheadMs) ? Math.max(0, aheadMs) : null,
        pages: query.data?.pages?.length || 0,
        fetching: Boolean(query.isFetching),
        error: Boolean(query.isError),
        updatedAt: now()
      };
      document.documentElement.setAttribute('data-kcf-buffer-v2', JSON.stringify(metrics));
    }, [progress, effectiveDisplayMs, aheadMs, query.data, query.isFetching, query.isError]);

    React.useEffect(() => () => {
      const state = control.current;
      clearScheduledTimeout(state.retryTimer);
      state.retryTimer = null;
      state.flight = null;
      document.documentElement.removeAttribute('data-kcf-buffer-v2');
    }, []);

    return { data: query.data, fetchNextPage: query.fetchNextPage, displayMs: effectiveDisplayMs };
  }

  root.KCFReplayTemplate = replayHook;
})(globalThis);
