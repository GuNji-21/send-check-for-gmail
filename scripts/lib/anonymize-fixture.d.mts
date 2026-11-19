// scripts/lib/anonymize-fixture.mjs の型定義（tests/ から型付きで import するため）。

export declare const FIXTURE_SCREENS: readonly string[];

export type FixtureFileName =
  | {
      readonly ok: true;
      readonly screen: string;
      readonly states: readonly string[];
      readonly lang: string;
      readonly date: string;
    }
  | { readonly ok: false; readonly reason: string };

export declare function parseFixtureFileName(fileName: string): FixtureFileName;

export declare function isReservedDomain(domain: string): boolean;

export declare function maskText(text: string): string;

export interface Change {
  readonly kind: 'element' | 'comment' | 'attribute' | 'text';
  readonly location: string;
  readonly before: string;
}

export interface AnonymizeResult {
  readonly html: string;
  readonly changes: readonly Change[];
  readonly addressCount: number;
  readonly domainCount: number;
}

export declare function anonymizeFixtureHtml(html: string): AnonymizeResult;

export interface Finding {
  readonly kind: 'email' | 'denylist' | 'element' | 'comment' | 'attribute' | 'text';
  readonly location: string;
  readonly value: string;
}

export declare function checkFixtureHtml(
  html: string,
  options?: { readonly denylist?: readonly string[] },
): Finding[];

export declare function parseDenylist(content: string): string[];
