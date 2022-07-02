import * as visitors from "./visitors";
import {
  VISITOR_KEYS,
  removeProperties,
  type RemovePropertiesOptions,
  traverseFast,
} from "@babel/types";
import type * as t from "@babel/types";
import * as cache from "./cache";
import type NodePath from "./path";
import type { default as Scope, Binding } from "./scope";
import type { Visitor } from "./types";
import { traverseNode } from "./traverse-node";
import { traversePath } from "./traverse-path";

export type { Visitor, Binding };
export { default as NodePath } from "./path";
export { default as Scope } from "./scope";
export { default as Hub } from "./hub";
export type { HubInterface } from "./hub";

export { visitors };

// fixme: The TraverseOptions should have been { scope ... } & Visitor<S>
// however TS does not support excluding certain string literals from general string
// type. If we change here to { scope ... } & Visitor<S>, TS will throw
// noScope: boolean because it matched `noScope` to the [k in string]: VisitNode<> catch-all
// in Visitor
export type TraverseOptions<S = t.Node> =
  | {
      scope?: Scope;
      noScope?: boolean;
      denylist?: string[];
    }
  | Visitor<S>;

function traverse<S>(
  parent: t.Node,
  opts: TraverseOptions<S>,
  scope: Scope | undefined,
  state: S,
  parentPath?: NodePath,
): void;

function traverse(
  parent: t.Node,
  opts: TraverseOptions,
  scope?: Scope,
  state?: any,
  parentPath?: NodePath,
): void;

function traverse<Options extends TraverseOptions>(
  parent: t.Node,
  // @ts-ignore provide {} as default value for Options
  opts: Options = {},
  scope?: Scope,
  state?: any,
  parentPath?: NodePath,
) {
  if (!parent) return;

  if (!opts.noScope && !scope) {
    if (parent.type !== "Program" && parent.type !== "File") {
      throw new Error(
        "You must pass a scope and parentPath unless traversing a Program/File. " +
          `Instead of that you tried to traverse a ${parent.type} node without ` +
          "passing scope and parentPath.",
      );
    }
  }

  if (!VISITOR_KEYS[parent.type]) {
    return;
  }

  visitors.explode(opts as Visitor);

  traverseNode(parent, opts, scope, state, parentPath);
}

export default traverse;

traverse.visitors = visitors;
traverse.verify = visitors.verify;
traverse.explode = visitors.explode;

traverse.cheap = function (node: t.Node, enter: (node: t.Node) => void) {
  return traverseFast(node, enter);
};

traverse.node = function (
  node: t.Node,
  opts: TraverseOptions,
  scope?: Scope,
  state?: any,
  path?: NodePath,
  skipKeys?: Record<string, boolean>,
) {
  traverseNode(node, opts, scope, state, path, skipKeys);
  // traverse.node always returns undefined
};

traverse.direct = function (
  path: NodePath,
  opts: TraverseOptions,
  visitSelf: boolean = false,
  state?: any,
) {
  if (!path) return;
  visitors.explode(opts as Visitor);
  traversePath(path, opts, visitSelf, state);
};

traverse.clearNode = function (node: t.Node, opts?: RemovePropertiesOptions) {
  removeProperties(node, opts);

  cache.path.delete(node);
};

traverse.removeProperties = function (
  tree: t.Node,
  opts?: RemovePropertiesOptions,
) {
  traverseFast(tree, traverse.clearNode, opts);
  return tree;
};

type HasDenylistedTypeState = {
  has: boolean;
  type: t.Node["type"];
};
function hasDenylistedType(path: NodePath, state: HasDenylistedTypeState) {
  if (path.node.type === state.type) {
    state.has = true;
    path.stop();
  }
}

traverse.hasType = function (
  tree: t.Node,
  type: t.Node["type"],
  denylistTypes?: Array<string>,
): boolean {
  // the node we're searching in is denylisted
  if (denylistTypes?.includes(tree.type)) return false;

  // the type we're looking for is the same as the passed node
  if (tree.type === type) return true;

  const state: HasDenylistedTypeState = {
    has: false,
    type: type,
  };

  traverse(
    tree,
    {
      noScope: true,
      denylist: denylistTypes,
      enter: hasDenylistedType,
    },
    null,
    state,
  );

  return state.has;
};

traverse.cache = cache;
