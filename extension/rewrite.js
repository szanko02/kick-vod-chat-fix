(function (root) {
  const marker = '"ChatroomReplayEntries"';
  const queryContract = 'getNextPageParam:(e,t,n)=>{if(e?.data)return{start_time:new Date(new Date(n.start_time).getTime()+5e3).toISOString()}}';
  const queryMethod = 'getInfiniteHistoryByChannel:(e,n)=>(0,t.infiniteQueryOptions)({queryKey:["WebChatHistory","getHistoryByChannel",e,n],queryFn:({signal:t,pageParam:n})=>o(t,e,n.start_time),initialPageParam:{start_time:n},' + queryContract + '})';

  const adapters = [
    {
      id: 'legacy-v0.2',
      imports: 'var t=e.i(676381),a=e.i(854670),s=e.i(963448),r=e.i(123499),i=e.i(76117),n=e.i(53275),o=e.i(213039),u=e.i(159838),l=e.i(820476),c=e.i(948590),h=e.i(119599),d=e.i(633841),f=e.i(149803),m=e.i(152098);',
      componentPrefix: 'e.s(["ChatroomReplayEntries",0,({startedAt:e,channelSlug:p,clipDialogProgress:g,withoutOpenIdentity:y=!1,withoutOpenThread:v=!1,className:C})=>{let b=new Date(e).getTime(),E=(0,i.useFlag)(n.FlagKey.ViewChatThread),x=(0,a.useRef)(null),{channelId:A}=(0,h.useChatroomContext)(),S=(0,u.usePlayerStore)(e=>e.currentProgressInMs),w=(0,u.usePlayerStore)(e=>e.isSeekbarSliding),M=g??S',
      before: ',_=(0,a.useRef)(0),q=(0,a.useRef)(-2500),[B,Q]=(0,a.useState)(0),[O,k]=(0,a.useState)(e),[D,R]=(0,a.useState)(!1),{data:P,fetchNextPage:I}=(0,s.useInfiniteQuery)({...(0,o.useInfiniteChatHistoryByChannel)({channelId:A,startTime:O}),enabled:!!("0001-01-01T00:00:00Z"!==e&&!w)});(0,a.useEffect)(()=>{if(M-_.current>2e3||M<_.current){_.current=M,q.current=M-2500,Q(M),k(new Date(b+M).toISOString());return}M>B+500&&Q(M),_.current=M,M-q.current>=5e3&&(I(),q.current=M)},[B,I,M,b]);',
      filter: 'T.filter(e=>new Date(e.created_at).getTime()<=b+B)',
      build(source, names) {
        const v = name => names.get(name) || name;
        const hook = `(${root.KCFReplayTemplate.toString()})({React:${v('a')},useInfiniteQuery:KCF_options_v3=>(0,${v('s')}.useInfiniteQuery)(KCF_options_v3),createOptions:KCF_start_v3=>(0,${v('o')}.useInfiniteChatHistoryByChannel)({channelId:${v('A')},startTime:KCF_start_v3}),initialStart:${v('e')},videoStartMs:${v('b')},progress:${v('M')},isSliding:${v('w')},channelId:${v('A')}})`;
        return `,[${v('D')},${v('R')}]=(0,${v('a')}.useState)(!1),KCF_replay_state_v3=${hook},${v('P')}=KCF_replay_state_v3.data,${v('I')}=KCF_replay_state_v3.fetchNextPage,${v('B')}=KCF_replay_state_v3.displayMs;`;
      }
    },
    {
      id: 'october-2026',
      imports: 'var t=e.i(100054),r=e.i(673781),a=e.i(963448),s=e.i(123499),n=e.i(76117),i=e.i(53275),o=e.i(213039),l=e.i(159838),c=e.i(820476),d=e.i(948590),u=e.i(119599),h=e.i(633841),p=e.i(149803),f=e.i(152098);',
      componentPrefix: 'e.s(["ChatroomReplayEntries",0,({startedAt:e,channelSlug:m,clipDialogProgress:g,withoutOpenIdentity:_=!1,withoutOpenThread:v=!1,className:x})=>{let w=new Date(e).getTime(),y=(0,n.useFlag)(i.FlagKey.ViewChatThread),b=(0,r.useRef)(null),{channelId:C}=(0,u.useChatroomContext)(),E=(0,l.usePlayerStore)(e=>e.currentProgressInMs),A=(0,l.usePlayerStore)(e=>e.isSeekbarSliding),S=g??E',
      before: ',R=(0,r.useRef)(0),N=(0,r.useRef)(-2500),[I,T]=(0,r.useState)(0),[j,L]=(0,r.useState)(e),[O,k]=(0,r.useState)(!1),{data:D,fetchNextPage:B}=(0,a.useInfiniteQuery)({...(0,o.useInfiniteChatHistoryByChannel)({channelId:C,startTime:j}),enabled:!!("0001-01-01T00:00:00Z"!==e&&!A)});(0,r.useEffect)(()=>{if(S-R.current>2e3||S<R.current){R.current=S,N.current=S-2500,T(S),L(new Date(w+S).toISOString());return}S>I+500&&T(S),R.current=S,S-N.current>=5e3&&(B(),N.current=S)},[I,B,S,w]);',
      filter: 'M.filter(e=>new Date(e.created_at).getTime()<=w+I)',
      build(source, names) {
        const v = name => names.get(name) || name;
        const hook = `(${root.KCFReplayTemplate.toString()})({React:${v('r')},useInfiniteQuery:KCF_options_v3=>(0,${v('a')}.useInfiniteQuery)(KCF_options_v3),createOptions:KCF_start_v3=>(0,${v('o')}.useInfiniteChatHistoryByChannel)({channelId:${v('C')},startTime:KCF_start_v3}),initialStart:${v('e')},videoStartMs:${v('w')},progress:${v('S')},isSliding:${v('A')},channelId:${v('C')}})`;
        return `,[${v('O')},${v('k')}]=(0,${v('r')}.useState)(!1),KCF_replay_state_v3=${hook},${v('D')}=KCF_replay_state_v3.data,${v('B')}=KCF_replay_state_v3.fetchNextPage,${v('I')}=KCF_replay_state_v3.displayMs;`;
      }
    }
  ];

  const expressionKeywords = new Set(['await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'of', 'return', 'throw', 'typeof', 'void', 'yield']);
  const controlKeywords = new Set(['catch', 'for', 'if', 'switch', 'while', 'with']);

  function scanJavaScript(source) {
    const result = { valid: true, markers: [], vars: [], queryDeclarations: [], patchIdentifiers: [] };
    const markerBefore = index => {
      while (index >= 0 && /\s/.test(source[index])) index--;
      return source[index];
    };
    const markerAfter = index => {
      while (index < source.length && /\s/.test(source[index])) index++;
      return source[index];
    };

    function skipString(start, quote) {
      for (let at = start + 1; at < source.length; at++) {
        if (source[at] === '\\') { at++; continue; }
        if (source[at] === quote) return at + 1;
        if ((quote === '"' || quote === "'") && /[\r\n]/.test(source[at])) return -1;
      }
      return -1;
    }

    function skipRegex(start) {
      let inClass = false;
      for (let at = start + 1; at < source.length; at++) {
        const ch = source[at];
        if (ch === '\\') { at++; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          at++;
          while (at < source.length && /[A-Za-z]/.test(source[at])) at++;
          return at;
        } else if (/[\r\n]/.test(ch)) return -1;
      }
      return -1;
    }

    function scanTemplate(start) {
      for (let at = start + 1; at < source.length;) {
        if (source[at] === '\\') { at += 2; continue; }
        if (source[at] === '`') return at + 1;
        if (source[at] === '$' && source[at + 1] === '{') {
          at = scanCode(at + 2, true);
          if (at < 0) return -1;
          continue;
        }
        at++;
      }
      return -1;
    }

    function scanCode(start, stopAtTemplateBrace = false) {
      let at = start;
      let braceDepth = 0;
      let regexAllowed = true;
      let pendingControl = false;
      const parenStack = [];
      while (at < source.length) {
        const ch = source[at];
        if (/\s/.test(ch)) { at++; continue; }
        if (stopAtTemplateBrace && ch === '}' && braceDepth === 0) return at + 1;
        if (source.startsWith('//', at)) {
          const end = source.indexOf('\n', at + 2);
          at = end < 0 ? source.length : end + 1;
          continue;
        }
        if (source.startsWith('/*', at)) {
          const end = source.indexOf('*/', at + 2);
          if (end < 0) { result.valid = false; return source.length; }
          at = end + 2;
          continue;
        }
        if (ch === '"' || ch === "'") {
          const end = skipString(at, ch);
          if (end < 0) { result.valid = false; return source.length; }
          if (source.slice(at, end) === marker && markerBefore(at - 1) === '[' && markerAfter(end) === ',') result.markers.push(at);
          at = end;
          regexAllowed = false;
          continue;
        }
        if (ch === '`') {
          const end = scanTemplate(at);
          if (end < 0) { result.valid = false; return source.length; }
          at = end;
          regexAllowed = false;
          continue;
        }
        if (ch === '/' && regexAllowed) {
          const end = skipRegex(at);
          if (end >= 0) { at = end; regexAllowed = false; continue; }
        }
        if (/[A-Za-z_$]/.test(ch)) {
          const startAt = at++;
          while (at < source.length && /[A-Za-z0-9_$]/.test(source[at])) at++;
          const word = source.slice(startAt, at);
          if (word === 'var') result.vars.push(startAt);
          if (word === 'KCF_replay_state_v3') result.patchIdentifiers.push(startAt);
          if (word === 'getInfiniteHistoryByChannel' && source[at] === ':') result.queryDeclarations.push(startAt);
          if (controlKeywords.has(word)) pendingControl = true;
          else if (word !== 'await' || !pendingControl) pendingControl = false;
          regexAllowed = expressionKeywords.has(word);
          continue;
        }
        if (/[0-9]/.test(ch)) {
          at++;
          while (at < source.length && /[A-Za-z0-9_.]/.test(source[at])) at++;
          pendingControl = false;
          regexAllowed = false;
          continue;
        }
        if (ch === '/') {
          at += source[at + 1] === '=' ? 2 : 1;
          regexAllowed = true;
          continue;
        }
        if (ch === '{') { braceDepth++; at++; regexAllowed = true; continue; }
        if (ch === '}' && braceDepth > 0) { braceDepth--; at++; regexAllowed = true; continue; }
        if (ch === '(') {
          parenStack.push(pendingControl);
          pendingControl = false;
          at++;
          regexAllowed = true;
          continue;
        }
        if (ch === ')') { at++; regexAllowed = parenStack.pop() === true; pendingControl = false; continue; }
        if (ch === ']') { at++; regexAllowed = false; pendingControl = false; continue; }
        if ((ch === '+' || ch === '-') && source[at + 1] === ch) { at += 2; regexAllowed = false; continue; }
        if (ch === '.' && source[at + 1] !== '.') { at++; regexAllowed = false; continue; }
        if (source.startsWith('?.', at)) { at += 2; regexAllowed = false; continue; }
        at++;
        if (ch !== '(') pendingControl = false;
        regexAllowed = true;
      }
      return stopAtTemplateBrace ? -1 : at;
    }

    scanCode(0);
    return result;
  }

  const keywords = new Set(['var', 'let', 'const', 'function', 'return', 'if', 'else', 'new', 'true', 'false', 'null', 'undefined', 'typeof', 'void', 'delete', 'in', 'instanceof', 'this', 'throw', 'try', 'catch', 'finally', 'async', 'await', 'yield', 'class', 'extends', 'super', 'import', 'export', 'from', 'as', 'default', 'switch', 'case', 'break', 'continue', 'for', 'while', 'do', 'of', 'with', 'debugger', 'static', 'get', 'set']);
  const globals = new Set(['Array', 'Boolean', 'Date', 'Error', 'Infinity', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'RegExp', 'Set', 'String', 'TextDecoder', 'TextEncoder', 'globalThis']);
  const operators = ['===', '!==', '>>>', '**=', '&&=', '||=', '??=', '...', '=>', '?.', '??', '&&', '||', '>=', '<=', '==', '!=', '++', '--', '+=', '-=', '*=', '/=', '%=', '**', '<<', '>>'];

  function tokenize(source, maxTokens = Infinity) {
    const tokens = [];
    const push = token => {
      tokens.push(token);
      return tokens.length === maxTokens;
    };
    for (let at = 0; at < source.length;) {
      const ch = source[at];
      if (/\s/.test(ch)) { at++; continue; }
      if (source.startsWith('//', at)) {
        const end = source.indexOf('\n', at + 2);
        at = end < 0 ? source.length : end + 1;
        continue;
      }
      if (source.startsWith('/*', at)) {
        const end = source.indexOf('*/', at + 2);
        if (end < 0) return null;
        at = end + 2;
        continue;
      }
      const start = at;
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        at++;
        let closed = false;
        while (at < source.length) {
          if (source[at] === '\\') { at += 2; continue; }
          if (source[at++] === quote) { closed = true; break; }
        }
        if (!closed) return null;
        if (push({ type: 'literal', value: source.slice(start, at), start, end: at })) return tokens;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        at++;
        while (at < source.length && /[A-Za-z0-9_$]/.test(source[at])) at++;
        if (push({ type: 'identifier', value: source.slice(start, at), start, end: at })) return tokens;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        const match = source.slice(at).match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?n?)/);
        if (!match) return null;
        at += match[0].length;
        if (push({ type: 'number', value: match[0], start, end: at })) return tokens;
        continue;
      }
      const operator = operators.find(value => source.startsWith(value, at));
      at += operator?.length || 1;
      if (push({ type: 'punctuation', value: operator || ch, start, end: at })) return tokens;
    }
    return tokens;
  }

  function parseImports(tokens) {
    if (!tokens || tokens[0]?.value !== 'var') return null;
    const aliases = [];
    const idIndexes = [];
    let callback = null;
    let at = 1;
    while (at < tokens.length) {
      const alias = tokens[at++];
      if (alias?.type !== 'identifier' || tokens[at++]?.value !== '=' ) return null;
      const currentCallback = tokens[at++];
      if (currentCallback?.type !== 'identifier' || tokens[at++]?.value !== '.' || tokens[at++]?.value !== 'i' || tokens[at++]?.value !== '(') return null;
      const id = tokens[at++];
      if (id?.type !== 'number' || !/^\d+$/.test(id.value) || tokens[at++]?.value !== ')') return null;
      if (callback === null) callback = currentCallback.value;
      if (callback !== currentCallback.value || aliases.includes(alias.value)) return null;
      aliases.push(alias.value);
      idIndexes.push(at - 2);
      if (tokens[at]?.value === ';') return { end: at, aliases, callback, idIndexes };
      if (tokens[at++]?.value !== ',') return null;
    }
    return null;
  }

  function isStaticIdentifier(tokens, index) {
    const token = tokens[index];
    return keywords.has(token.value) || globals.has(token.value) ||
      tokens[index - 1]?.value === '.' || tokens[index - 1]?.value === '?.' ||
      tokens[index + 1]?.value === ':';
  }

  function compareTokens(expected, candidate, expectedImportIds = [], candidateImportIds = []) {
    if (!expected || !candidate || expected.length !== candidate.length) return null;
    const ignoredNumbers = new Set(expectedImportIds);
    const candidateNumbers = new Set(candidateImportIds);
    const expectedToCandidate = new Map();
    const candidateToExpected = new Map();
    for (let index = 0; index < expected.length; index++) {
      const left = expected[index];
      const right = candidate[index];
      if (left.type !== right.type) return null;
      if (left.type === 'identifier') {
        const leftStatic = isStaticIdentifier(expected, index);
        const rightStatic = isStaticIdentifier(candidate, index);
        if (leftStatic !== rightStatic) return null;
        if (leftStatic) {
          if (left.value !== right.value) return null;
        } else {
          const priorRight = expectedToCandidate.get(left.value);
          const priorLeft = candidateToExpected.get(right.value);
          if ((priorRight !== undefined && priorRight !== right.value) ||
              (priorLeft !== undefined && priorLeft !== left.value)) return null;
          expectedToCandidate.set(left.value, right.value);
          candidateToExpected.set(right.value, left.value);
        }
      } else if (left.type === 'number' && ignoredNumbers.has(index) && candidateNumbers.has(index)) {
        if (!/^\d+$/.test(left.value) || !/^\d+$/.test(right.value)) return null;
      } else if (left.value !== right.value) return null;
    }
    return expectedToCandidate;
  }

  function matchCanonicalFragment(expectedSource, prefixSource, source, start) {
    const expectedTokens = tokenize(expectedSource);
    const prefixCount = tokenize(prefixSource)?.length;
    const candidateTokens = tokenize(source.slice(start, start + 8192), expectedTokens.length);
    if (!expectedTokens || !prefixCount || !candidateTokens || candidateTokens.length < expectedTokens.length) return null;
    const expectedImports = parseImports(expectedTokens);
    const candidateImports = parseImports(candidateTokens);
    if (!expectedImports || !candidateImports || expectedImports.aliases.length !== candidateImports.aliases.length) return null;
    const mapping = compareTokens(expectedTokens, candidateTokens.slice(0, expectedTokens.length),
      expectedImports.idIndexes, candidateImports.idIndexes);
    if (!mapping) return null;
    const fragment = candidateTokens.slice(0, expectedTokens.length);
    return {
      mapping,
      segmentStart: start + fragment[prefixCount].start,
      segmentEnd: start + fragment[fragment.length - 1].end
    };
  }

  function detectQueryContract(source) {
    if (typeof source !== 'string') return null;
    const scan = scanJavaScript(source);
    if (!scan.valid) return null;
    const expected = tokenize(queryMethod);
    if (!expected) return null;
    const declarations = scan.queryDeclarations.filter(offset => {
      let previous = offset - 1;
      while (previous >= 0 && /\s/.test(source[previous])) previous--;
      return previous < 0 || source[previous] === ',' || source[previous] === '{';
    });
    if (declarations.length !== 1) return null;
    const offset = declarations[0];
    const candidate = tokenize(source.slice(offset, offset + 8192), expected.length + 1);
    return candidate && candidate.length === expected.length + 1 &&
      compareTokens(expected, candidate.slice(0, expected.length)) && candidate[expected.length].value === ','
      ? 'october-2026'
      : null;
  }

  function adaptBundleSource(source, options = {}) {
    if (typeof source !== 'string') return { source, status: 'unchanged', reason: 'invalid-source' };
    const scan = scanJavaScript(source);
    if (!scan.valid) return { source, status: 'unchanged', reason: 'invalid-source' };
    if (scan.markers.length === 0) return { source, status: 'unchanged', reason: 'no-target' };
    if (scan.markers.length !== 1) return { source, status: 'unsupported', reason: 'duplicate-marker' };
    if (scan.patchIdentifiers.length)
      return { source, status: 'unsupported', reason: 'duplicate-patch' };
    if (!root.KCFReplayTemplate) return { source, status: 'unchanged', reason: 'template-missing' };

    const markerAt = scan.markers[0];
    for (const adapter of adapters) {
      const prefixSource = adapter.imports + adapter.componentPrefix;
      const expectedSource = prefixSource + adapter.before;
      const candidates = scan.vars.filter(offset => offset < markerAt);
      let match = null;
      for (let index = candidates.length - 1; index >= 0 && !match; index--)
        match = matchCanonicalFragment(expectedSource, prefixSource, source, candidates[index]);
      if (!match || markerAt >= match.segmentStart ||
          match.segmentEnd < markerAt || source.split(adapter.filter).length - 1 !== 1 ||
          source.indexOf(adapter.filter, match.segmentEnd) < match.segmentEnd) continue;
      if (!options.contractVerified)
        return { source, status: 'unchanged', reason: 'contract-unverified', adapter: adapter.id };
      const replacement = adapter.build(source, match.mapping);
      return {
        source: source.slice(0, match.segmentStart) + replacement + source.slice(match.segmentEnd),
        status: 'applied',
        adapter: adapter.id
      };
    }
    return { source, status: 'unsupported', reason: 'unknown-segment' };
  }

  root.KCFSourceRewrite = { adaptBundleSource, detectQueryContract };
})(globalThis);
