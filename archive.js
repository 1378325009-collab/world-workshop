(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('fflate'));
  else root.WorldWorkshopArchive = factory(root.fflate);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (zip) {
  'use strict';

  const FORMAT = 'world-workshop-archive';
  const VERSION = 2;
  const ENTRY_FORMAT = 'world-workshop-entry';
  const ENTRY_VERSION = 1;
  const MAX_BYTES = 512 * 1024 * 1024;
  const MAX_FILES = 50000;
  const ASSET_KEY = '__worldWorkshopAsset';
  const WORLD_KEYS = new Set(['schemaVersion', 'project', 'typeGroups', 'typeDefinitions', 'entries', 'relationTypes', 'relations', 'events', 'maps', 'relationGraphs', 'scripts', 'exportedAt']);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const list = (value) => Array.isArray(value) ? value : [];

  function safeName(value, fallback) {
    let name = String(value || fallback || '未命名').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 48);
    if (!name || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = '_' + (name || '未命名');
    return name;
  }

  function select(world, requested) {
    if (!world || !world.project || !Array.isArray(world.entries)) throw new Error('没有可导出的世界档案。');
    const scope = { kind: requested && requested.kind || 'world', id: requested && requested.id || '', label: world.project.name };
    if (!['world', 'group', 'type', 'entry'].includes(scope.kind)) throw new Error('不支持的导出范围。');
    const snapshot = clone(world);
    if (scope.kind === 'world') return { world: snapshot, scope, externalReferences: [] };
    const types = list(world.typeDefinitions);
    let selectedTypes;
    if (scope.kind === 'group') {
      const group = list(world.typeGroups).find((item) => item.id === scope.id);
      if (!group) throw new Error('请选择有效的一级分类。');
      scope.label = group.label;
      selectedTypes = types.filter((type) => type.groupId === group.id).map((type) => type.id);
    } else if (scope.kind === 'type') {
      const type = types.find((item) => item.id === scope.id);
      if (!type) throw new Error('请选择有效的设定类型。');
      scope.label = type.label;
      selectedTypes = [type.id];
    } else {
      const entry = world.entries.find((item) => item.id === scope.id);
      if (!entry) throw new Error('请选择有效的设定项。');
      scope.label = entry.name;
      selectedTypes = [entry.type];
    }
    const entries = snapshot.entries.filter((entry) => scope.kind === 'entry' ? entry.id === scope.id : selectedTypes.includes(entry.type));
    const ids = new Set(entries.map((entry) => entry.id));
    const relations = list(snapshot.relations).filter((relation) => ids.has(relation.from) && ids.has(relation.to));
    const relationTypes = list(snapshot.relationTypes).filter((type) => relations.some((relation) => relation.typeId === type.id || (!relation.typeId && relation.type === type.label)));
    const typeIds = new Set(selectedTypes);
    relationTypes.forEach((type) => [...list(type.fromTypeIds), ...list(type.toTypeIds)].forEach((id) => typeIds.add(id)));
    const definitions = list(snapshot.typeDefinitions).filter((type) => typeIds.has(type.id));
    const groupIds = new Set(definitions.map((type) => type.groupId));
    if (scope.kind === 'group') groupIds.add(scope.id);
    const externalReferences = entries.filter((entry) => entry.parentId && !ids.has(entry.parentId)).map((entry) => ({ kind: 'parent', entryId: entry.id, targetId: entry.parentId }));
    return {
      world: { schemaVersion: snapshot.schemaVersion, project: snapshot.project, typeGroups: list(snapshot.typeGroups).filter((group) => groupIds.has(group.id)), typeDefinitions: definitions, entries, relationTypes, relations, events: [], maps: [], relationGraphs: [], scripts: [] },
      scope,
      externalReferences
    };
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
  }

  async function pack(selection) {
    if (!zip) throw new Error('压缩组件未加载，请刷新后重试。');
    const world = selection.world;
    const kindNames = { world: '世界档案', group: '分类', type: '类型', entry: '设定' };
    const baseName = safeName(selection.scope.label) + '-' + kindNames[selection.scope.kind];
    const root = selection.scope.kind === 'entry' ? '' : baseName + '/';
    const files = Object.create(null);
    const usedPaths = new Set();
    const assetPaths = new Map();
    const assets = [];
    let totalBytes = 0;
    function add(path, bytes, options) {
      if (usedPaths.has(path)) throw new Error('档案内出现重名文件：' + path);
      totalBytes += bytes.length;
      if (totalBytes > MAX_BYTES || usedPaths.size >= MAX_FILES) throw new Error('档案内容过大，请按类型分批导出。');
      usedPaths.add(path);
      files[root + path] = [bytes, options || {}];
    }
    function separateAssets(value) {
      if (typeof value === 'string') {
        if (/^idb-entry-image:/.test(value)) throw new Error('部分图片尚未读取完成，请稍后重试。');
        const image = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(value);
        if (!image) return value;
        let path = assetPaths.get(value);
        if (!path) {
          const mimeType = image[1].toLowerCase();
          const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp' };
          const binary = atob(image[2]);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          path = '图片/图片-' + String(assets.length + 1).padStart(4, '0') + '.' + (extensions[mimeType] || 'bin');
          add(path, bytes, { level: 0 });
          assets.push({ path, mimeType, bytes: bytes.length });
          assetPaths.set(value, path);
        }
        return { [ASSET_KEY]: path };
      }
      if (Array.isArray(value)) return value.map(separateAssets);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, separateAssets(child)]));
    }
    function json(path, value) {
      add(path, zip.strToU8(JSON.stringify(separateAssets(value), null, 2)));
      return path;
    }
    function optionalList(path, value) {
      const items = list(value);
      return items.length ? json(path, items) : undefined;
    }
    function records(items, folder, suffix, labelKey) {
      const ids = new Set();
      return list(items).map((item, index) => {
        if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error(folder + '中存在缺失或重复的 ID。');
        ids.add(item.id);
        const name = safeName(item[labelKey || 'name'], item.id) + '__' + String(index + 1).padStart(4, '0');
        return { id: item.id, path: json(folder + '/' + name + suffix, item) };
      });
    }
    if (selection.scope.kind === 'entry') {
      if (list(world.entries).length !== 1) throw new Error('单项导出必须只包含一条设定。');
      const entry = world.entries[0];
      const type = list(world.typeDefinitions).find((item) => item.id === entry.type);
      const group = type && list(world.typeGroups).find((item) => item.id === type.groupId);
      if (!type || !group) throw new Error('设定缺少对应的分类或类型定义。');
      const document = separateAssets({
        ...entry,
        __worldWorkshop: {
          format: ENTRY_FORMAT, formatVersion: ENTRY_VERSION, schemaVersion: world.schemaVersion || 1,
          exportedAt: new Date().toISOString(),
          source: { id: world.project.id, name: world.project.name, createdAt: world.project.createdAt },
          typeGroups: [group], typeDefinitions: [type], externalReferences: selection.externalReferences || []
        }
      });
      document.__worldWorkshop.assets = assets;
      const entryPath = safeName(entry.name) + '.json';
      add(entryPath, zip.strToU8(JSON.stringify(document, null, 2)));
      const bytes = await new Promise((resolve, reject) => zip.zip(files, { level: 6 }, (error, data) => error ? reject(error) : resolve(data)));
      return { bytes, fileName: baseName + '.zip', manifest: document.__worldWorkshop };
    }
    const manifest = {
      format: FORMAT, formatVersion: VERSION, schemaVersion: world.schemaVersion || 1,
      exportedAt: new Date().toISOString(), scope: clone(selection.scope), externalReferences: selection.externalReferences || [],
      project: json('档案信息.json', world.project),
      groups: records(world.typeGroups, '分类', '/分类定义.json', 'label'),
      types: [], entries: [],
      relationTypes: optionalList('关系类型.json', world.relationTypes),
      relations: optionalList('关系.json', world.relations),
      events: optionalList('时间线.json', world.events),
      maps: records(world.maps, '地图', '/地图信息.json'),
      relationGraphs: records(world.relationGraphs, '关系图谱', '.json'),
      scripts: records(world.scripts, '剧本', '.json', 'title'),
      assets
    };
    const typeFolders = new Map();
    const typeIds = new Set();
    list(world.typeDefinitions).forEach((type, index) => {
      if (typeIds.has(type.id)) throw new Error('设定类型存在重复 ID。');
      typeIds.add(type.id);
      const folder = '设定/' + safeName(type.label, type.id) + '__' + String(index + 1).padStart(4, '0');
      typeFolders.set(type.id, folder);
      manifest.types.push({ id: type.id, path: json(folder + '/类型定义.json', type) });
    });
    const entryIds = new Set();
    list(world.entries).forEach((entry, index) => {
      if (!entry.id || entryIds.has(entry.id)) throw new Error('设定项存在缺失或重复 ID。');
      entryIds.add(entry.id);
      const folder = typeFolders.get(entry.type);
      if (!folder) throw new Error('设定「' + entry.name + '」缺少对应的类型定义。');
      manifest.entries.push({ id: entry.id, typeId: entry.type, path: json(folder + '/' + safeName(entry.name) + '__' + String(index + 1).padStart(4, '0') + '.json', entry) });
    });
    const extras = Object.fromEntries(Object.entries(world).filter(([key]) => !WORLD_KEYS.has(key)));
    if (Object.keys(extras).length) manifest.extras = json('扩展信息.json', extras);
    // The manifest references the only copy of every record; record files remain editable.
    add('manifest.json', zip.strToU8(JSON.stringify(manifest, null, 2)));
    const scopeNames = { world: '整个世界', group: '一级分类', type: '设定类型', entry: '单个设定项' };
    add('阅读说明.txt', zip.strToU8('导出范围：' + scopeNames[selection.scope.kind] + '「' + selection.scope.label + '」，共 ' + list(world.entries).length + ' 条设定。\n这是世界工坊 ZIP 档案。设定按类型分目录，每个条目独立保存为 JSON，图片集中存放。\n没有内容的关系、时间线与扩展信息不生成占位文件。分类定义、类型定义与清单用于还原字段和导入。\n请在世界工坊选择“导入”并选中完整 ZIP。世界包可替换档案，分类、类型与设定包合并到当前世界。\n可以编辑 JSON 内容；请保留 ID 和图片引用，重命名或增删文件时同时更新 manifest.json。\n'));
    const bytes = await new Promise((resolve, reject) => zip.zip(files, { level: 6 }, (error, data) => error ? reject(error) : resolve(data)));
    return { bytes, fileName: baseName + '.zip', manifest };
  }

  function createAssetRestorer(files, root, assets) {
    const assetValues = new Map();
    list(assets).forEach((asset) => {
      if (!asset || !/^图片\/[^/]+$/.test(asset.path) || !/^image\/[a-z0-9.+-]+$/i.test(asset.mimeType) || !Object.hasOwn(files, root + asset.path)) throw new Error('档案图片引用无效。');
      const data = files[root + asset.path];
      if (data.byteLength !== asset.bytes) throw new Error('图片文件大小与记录不符：' + asset.path);
      assetValues.set(asset.path, 'data:' + asset.mimeType + ';base64,' + bytesToBase64(data));
    });
    function restore(value) {
      if (Array.isArray(value)) return value.map(restore);
      if (!value || typeof value !== 'object') return value;
      if (Object.hasOwn(value, ASSET_KEY)) {
        const data = assetValues.get(value[ASSET_KEY]);
        if (!data) throw new Error('缺少档案中引用的图片：' + value[ASSET_KEY]);
        return data;
      }
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restore(child)]));
    }
    return restore;
  }

  function validateWorld(world) {
    if (!world.project || typeof world.project.name !== 'string' || !world.project.name.trim()) throw new Error('档案缺少世界名称。');
    if (!Array.isArray(world.typeDefinitions) || !Array.isArray(world.typeGroups) || !Array.isArray(world.entries)) throw new Error('档案缺少分类、类型或设定。');
    const typeIds = new Set(world.typeDefinitions.map((type) => type.id));
    const groupIds = new Set(world.typeGroups.map((group) => group.id));
    if (world.typeDefinitions.some((type) => !groupIds.has(type.groupId)) || world.entries.some((entry) => !typeIds.has(entry.type))) throw new Error('档案缺少被引用的分类或类型定义。');
    if (!Array.isArray(world.relations) || !Array.isArray(world.relationTypes) || !Array.isArray(world.events)) throw new Error('档案的关系或时间线格式无效。');
    const entryIds = new Set(world.entries.map((entry) => entry.id));
    if (world.relations.some((relation) => !relation || !entryIds.has(relation.from) || !entryIds.has(relation.to))) throw new Error('档案包含指向包外条目的关系，请重新导出。');
  }

  function readEntry(files) {
    const documents = Object.keys(files).filter((path) => /\.json$/i.test(path));
    if (documents.length !== 1) throw new Error('请选择完整的世界工坊档案或单项 ZIP。');
    const path = documents[0];
    const root = path.slice(0, path.lastIndexOf('/') + 1);
    let document;
    try { document = JSON.parse(zip.strFromU8(files[path])); }
    catch (error) { throw new Error('人物或设定 JSON 无法读取。'); }
    const metadata = document && document.__worldWorkshop;
    if (!metadata || metadata.format !== ENTRY_FORMAT || metadata.formatVersion !== ENTRY_VERSION) throw new Error('不支持此单项档案格式或版本。');
    const { __worldWorkshop, ...record } = document;
    if (typeof record.id !== 'string' || !record.id || typeof record.name !== 'string' || !record.name.trim()) throw new Error('单项档案缺少设定名称或 ID。');
    const restore = createAssetRestorer(files, root, metadata.assets);
    const world = {
      schemaVersion: metadata.schemaVersion, project: metadata.source,
      typeGroups: restore(metadata.typeGroups), typeDefinitions: restore(metadata.typeDefinitions), entries: [restore(record)],
      relationTypes: [], relations: [], events: [], maps: [], relationGraphs: [], scripts: []
    };
    validateWorld(world);
    return { world, scope: { kind: 'entry', id: record.id, label: record.name }, manifest: metadata };
  }

  async function read(input) {
    if (!zip) throw new Error('压缩组件未加载，请刷新后重试。');
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > MAX_BYTES) throw new Error('压缩包超过可读取大小，请拆分为类型包。');
    let totalBytes = 0;
    let fileCount = 0;
    const files = await new Promise((resolve, reject) => {
      zip.unzip(bytes, { filter(file) {
        const path = file.name;
        if (/^[\/\\]|\\|(?:^|\/)\.\.(?:\/|$)|\u0000|^[a-z]:/i.test(path)) throw new Error('压缩包包含无效的文件路径。');
        totalBytes += file.originalSize;
        if (!Number.isFinite(totalBytes) || totalBytes > MAX_BYTES || ++fileCount > MAX_FILES) throw new Error('压缩包内容过多，请拆分后导入。');
        return !path.endsWith('/');
      } }, (error, data) => error ? reject(error) : resolve(data));
    });
    const manifests = Object.keys(files).filter((path) => path === 'manifest.json' || path.endsWith('/manifest.json'));
    if (!manifests.length) return readEntry(files);
    if (manifests.length !== 1) throw new Error('请选择一个完整的世界工坊 ZIP 档案。');
    const manifestPath = manifests[0];
    const root = manifestPath.slice(0, -'manifest.json'.length);
    const parse = (path) => {
      if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..') || !Object.hasOwn(files, root + path)) throw new Error('档案缺少文件或引用无效：' + String(path));
      try { return JSON.parse(zip.strFromU8(files[root + path])); }
      catch (error) { throw new Error('JSON 文件无法读取：' + path); }
    };
    let manifest;
    try { manifest = JSON.parse(zip.strFromU8(files[manifestPath])); }
    catch (error) { throw new Error('档案清单 manifest.json 无法读取。'); }
    if (manifest && manifest.__worldWorkshop && manifest.__worldWorkshop.format === ENTRY_FORMAT) return readEntry(files);
    if (!manifest || manifest.format !== FORMAT || ![1, VERSION].includes(manifest.formatVersion) || !manifest.scope || !['world', 'group', 'type', 'entry'].includes(manifest.scope.kind)) throw new Error('不支持此 ZIP 档案格式或版本。');
    const restore = createAssetRestorer(files, root, manifest.assets);
    function records(key) {
      if (!Array.isArray(manifest[key])) throw new Error('档案清单缺少列表：' + key);
      const ids = new Set();
      return manifest[key].map((record) => {
        const item = restore(parse(record.path));
        if (!item || item.id !== record.id || ids.has(item.id)) throw new Error('文件 ID 与清单不符或重复：' + record.path);
        if (key === 'entries' && item.type !== record.typeId) throw new Error('设定类型与清单不符：' + record.path);
        ids.add(item.id);
        return item;
      });
    }
    function optional(key, fallback) {
      if (manifest.formatVersion >= 2 && !Object.hasOwn(manifest, key)) return fallback;
      return restore(parse(manifest[key]));
    }
    const world = { ...optional('extras', {}), schemaVersion: manifest.schemaVersion, project: restore(parse(manifest.project)), typeGroups: records('groups'), typeDefinitions: records('types'), entries: records('entries'), maps: records('maps'), relationGraphs: records('relationGraphs'), scripts: records('scripts'), relationTypes: optional('relationTypes', []), relations: optional('relations', []), events: optional('events', []) };
    validateWorld(world);
    return { world, scope: manifest.scope, manifest };
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }

  // Inputs are normalized by the application before merging. Never mutate either world.
  function merge(local, incoming, policy) {
    if (!['skip', 'update', 'copy'].includes(policy)) throw new Error('请选择重复条目的处理方式。');
    const world = clone(local);
    const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    const occupied = new Set([...world.typeGroups, ...world.typeDefinitions].map((item) => item.id));
    const groups = new Map();
    const types = new Map();
    const entryIds = new Map();
    const writtenIds = new Set();
    const stats = { added: 0, updated: 0, skipped: 0, relations: 0, definitions: 0, separateDefinitions: 0, unresolvedParents: 0 };
    const sameWorld = Boolean(local.project.id && local.project.id === incoming.project.id && local.project.createdAt && local.project.createdAt === incoming.project.createdAt);
    const rewriteKey = (key, mapping, owner) => {
      const parts = String(key).split(':');
      return parts.length === 3 && parts[0] === owner && mapping.has(parts[1]) ? owner + ':' + mapping.get(parts[1]) + ':' + parts[2] : key;
    };
    const labelFor = (label, n) => {
      const suffix = '（导入 ' + n + '）';
      return String(label).slice(0, 32 - suffix.length) + suffix;
    };
    function definition(raw, collection, build) {
      const labelTaken = (candidate) => collection.some((item) => item.label.toLocaleLowerCase() === candidate.label.toLocaleLowerCase() && (candidate.groupId == null || item.groupId === candidate.groupId));
      const first = build(raw.id, raw.label);
      const existing = collection.find((item) => item.id === raw.id);
      if (existing && equal(existing, first)) return existing.id;
      if (!occupied.has(raw.id) && !labelTaken(first)) {
        collection.push(first); occupied.add(raw.id); stats.definitions++;
        return raw.id;
      }
      for (let n = 2; n < MAX_FILES; n++) {
        const id = String(raw.id).slice(0, 47) + '-import-' + n;
        const candidate = build(id, labelFor(raw.label, n));
        const found = collection.find((item) => item.id === id);
        if (found && equal(found, candidate)) return id;
        if (occupied.has(id) || labelTaken(candidate)) continue;
        collection.push(candidate); occupied.add(id); stats.definitions++; stats.separateDefinitions++;
        return id;
      }
      throw new Error('重复类型过多，请整理当前分类后重试。');
    }
    const activeEntries = incoming.entries.filter((entry) => policy !== 'skip' || !world.entries.some((item) => item.id === entry.id));
    stats.skipped = incoming.entries.length - activeEntries.length;
    const activeIds = new Set(activeEntries.map((entry) => entry.id));
    const activeRelations = incoming.relations.filter((relation) => activeIds.has(relation.from) && activeIds.has(relation.to));
    const usedRelationTypes = incoming.relationTypes.filter((type) => activeRelations.some((relation) => relation.typeId === type.id));
    // Packages also carry empty types and groups; preserve the complete exported taxonomy.
    const definitions = incoming.typeDefinitions;
    incoming.typeGroups.forEach((raw) => {
      const id = definition(raw, world.typeGroups, (id, label) => ({ ...clone(raw), id, label, commonFieldOrder: list(raw.commonFieldOrder).map((key) => rewriteKey(key, new Map([[raw.id, id]]), 'group')) }));
      groups.set(raw.id, id);
    });
    definitions.forEach((raw) => {
      const id = definition(raw, world.typeDefinitions, (id, label) => {
        const item = { ...clone(raw), id, label, groupId: groups.get(raw.groupId) };
        if ((raw.groupId === 'geography' || raw.geographic === true) && item.groupId !== 'geography') item.geographic = true;
        if (Array.isArray(raw.fieldOrder)) item.fieldOrder = raw.fieldOrder.map((key) => rewriteKey(rewriteKey(key, groups, 'group'), new Map([[raw.id, id]]), 'type'));
        return item;
      });
      types.set(raw.id, id);
    });
    const localIds = new Set(world.entries.map((entry) => entry.id));
    const reservedIds = new Set([...localIds, ...incoming.entries.map((entry) => entry.id)]);
    function uniqueId(original, reserved) {
      for (let n = 2; n < MAX_FILES; n++) {
        const id = original + '-import-' + n;
        if (!reserved.has(id)) { reserved.add(id); return id; }
      }
      throw new Error('重复记录过多，请整理后重试。');
    }
    activeEntries.forEach((entry) => entryIds.set(entry.id, policy === 'copy' && localIds.has(entry.id) ? uniqueId(entry.id, reservedIds) : entry.id));
    activeEntries.forEach((raw) => {
      const entry = clone(raw);
      entry.id = entryIds.get(raw.id);
      entry.type = types.get(raw.type);
      entry.customFields = Object.fromEntries(Object.entries(entry.customFields || {}).map(([key, value]) => [rewriteKey(rewriteKey(key, groups, 'group'), types, 'type'), value]));
      entry.parentId = entryIds.get(raw.parentId) || (sameWorld && localIds.has(raw.parentId) ? raw.parentId : '');
      if (raw.parentId && !entry.parentId) stats.unresolvedParents++;
      if (entry.id !== raw.id) entry.name += '（导入副本）';
      const index = world.entries.findIndex((item) => item.id === entry.id);
      if (index < 0) { world.entries.push(entry); stats.added++; }
      else { world.entries[index] = entry; stats.updated++; }
      writtenIds.add(entry.id);
    });
    const relationTypes = new Map();
    usedRelationTypes.forEach((raw) => {
      const base = { ...clone(raw), fromTypeIds: raw.fromTypeIds.map((id) => types.get(id) || id), toTypeIds: raw.toTypeIds.map((id) => types.get(id) || id) };
      let match;
      let label = base.label;
      for (let n = 2; n < MAX_FILES; n++) {
        const existing = world.relationTypes.find((item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase());
        if (!existing) break;
        if (equal({ ...existing, id: '', label: '' }, { ...base, id: '', label: '' })) { match = existing; break; }
        label = labelFor(base.label, n);
      }
      if (match) { relationTypes.set(raw.id, match.id); return; }
      const ids = new Set(world.relationTypes.map((item) => item.id));
      const id = ids.has(base.id) ? uniqueId(base.id, ids) : base.id;
      world.relationTypes.push({ ...base, id, label });
      relationTypes.set(raw.id, id);
    });
    const relationIds = new Set([...world.relations, ...incoming.relations].map((item) => item.id));
    activeRelations.forEach((raw) => {
      const typeId = relationTypes.get(raw.typeId);
      const type = world.relationTypes.find((item) => item.id === typeId);
      if (!type) throw new Error('部分关系缺少类型定义，请重新导出。');
      const relation = { ...clone(raw), from: entryIds.get(raw.from), to: entryIds.get(raw.to), typeId, type: type.label };
      const index = world.relations.findIndex((item) => item.id === raw.id);
      if (index >= 0 && equal(world.relations[index], relation)) return;
      if (index >= 0 && policy === 'skip') return;
      if (index >= 0 && policy === 'update') world.relations[index] = relation;
      else { if (index >= 0) relation.id = uniqueId(raw.id, relationIds); world.relations.push(relation); }
      stats.relations++;
    });
    return { world, stats, writtenIds: [...writtenIds] };
  }

  return { FORMAT, VERSION, ENTRY_FORMAT, ENTRY_VERSION, MAX_BYTES, select, pack, read, merge, safeName };
});
