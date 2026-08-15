async function resolveTypeScriptModule(specifier, context, nextResolve) {
  const candidates = [
    specifier,
    `${specifier}.ts`,
    `${specifier}.tsx`,
    `${specifier}/index.ts`,
  ];

  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context, nextResolve);
    } catch {
      // Try the next TypeScript-aware resolution candidate.
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }

  if (specifier.startsWith("@/")) {
    const repositoryPath = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
    const resolved = await resolveTypeScriptModule(
      repositoryPath.href,
      context,
      nextResolve,
    );

    if (resolved) {
      return resolved;
    }
  }

  if (specifier.startsWith(".") && !/[?][^/]*$/.test(specifier)) {
    const resolved = await resolveTypeScriptModule(
      specifier,
      context,
      nextResolve,
    );

    if (resolved) {
      return resolved;
    }
  }

  return nextResolve(specifier, context, nextResolve);
}
