# 40kdc rules-data adapter

`@alpaca-software/40kdc-data` is the primary metadata source. Package types are
contained in `source.ts`; the rest of the application receives only the existing
`StratagemDefinition` domain model and provider-owned diagnostics.

The adapter imports names, detachment associations, CP costs, phases, player-turn
scope, usage limits, structured triggers, and structured keyword restrictions.
It never imports or embeds source rules prose. An absent trigger, an unmapped
event, a trigger guard the Reaction Engine cannot express, or unstructured notes
make timing require manual confirmation.

The secondary cross-check is [BSData/wh40k-11e](https://github.com/BSData/wh40k-11e).
Its faction catalogue names and New Recruit detachment selection names are useful
for association checks. It is not used as a runtime rules-prose fallback: the
repository has no versioned TypeScript package/API contract, and its catalogue
contains prose that this application deliberately does not ingest.

The installed 40kdc package requires visible credit in a public deployment. Use
the exported `FORTY_KDC_ATTRIBUTION` value when the application adds its About or
credits surface.
