import { describe, expect, it } from "vitest";
import type { LinkTypeMeta } from "./graph";
import {
  canvasLabel,
  compatibleHardnesses,
  compatibleRelations,
  edgeDisplayData,
  inspectKind,
  inspectRelation,
  kindLabel,
  inspectTitle,
  parseCompatibleLinkTypes,
  parseLinkType,
  presentLinkKinds,
  removeLinkMenuLabel,
  resolveLinkTypeId,
  uniqueCompatibleKinds,
} from "./link-display";

describe("parseLinkType", () => {
  it("parses precedence with relation, hardness, and scope", () => {
    expect(parseLinkType("precedes_FS_Mandatory_scope")).toEqual({
      linkType: "precedes_FS_Mandatory_scope",
      kind: "precedes",
      relation: "FS",
      hardness: "Mandatory",
      scoped: true,
    });
    expect(parseLinkType("precedes_FF_Discretionary")).toMatchObject({
      kind: "precedes",
      relation: "FF",
      hardness: "Discretionary",
      scoped: false,
    });
    expect(parseLinkType("precedes_SS_Optional")).toMatchObject({
      relation: "SS",
      hardness: "Optional",
    });
  });

  it("normalizes supports and targets aliases", () => {
    expect(parseLinkType("supports_wp").kind).toBe("supports");
    expect(parseLinkType("supports").kind).toBe("supports");
    expect(parseLinkType("targets_wp").kind).toBe("targets");
    expect(parseLinkType("targets").kind).toBe("targets");
  });

  it("maps named non-precedence types", () => {
    expect(parseLinkType("parent_of").kind).toBe("parent_of");
    expect(parseLinkType("promoted_from").kind).toBe("promoted_from");
  });

  it("falls back to other for unknown ids", () => {
    expect(parseLinkType("custom_edge").kind).toBe("other");
    expect(parseLinkType("precedes_XX_Mandatory").kind).toBe("other");
  });
});

describe("link display labels", () => {
  it("hides canvas labels except non-FS precedence", () => {
    expect(canvasLabel(parseLinkType("precedes_FS_Mandatory"))).toBe("");
    expect(canvasLabel(parseLinkType("precedes_FF_Optional_scope"))).toBe("FF");
    expect(canvasLabel(parseLinkType("supports"))).toBe("");
    expect(canvasLabel(parseLinkType("parent_of"))).toBe("");
  });

  it("builds inspector titles without underscores or scope", () => {
    expect(inspectTitle(parseLinkType("precedes_FS_Mandatory_scope"))).toBe(
      "Mandatory finish-to-start",
    );
    expect(inspectTitle(parseLinkType("precedes_SF_Discretionary"))).toBe(
      "Discretionary start-to-finish",
    );
    expect(inspectTitle(parseLinkType("supports_wp"))).toBe("Supports");
    expect(inspectTitle(parseLinkType("promoted_from"))).toBe("Promoted from");
    expect(inspectTitle(parseLinkType("custom_edge"))).toBe("Custom Edge");
  });

  it("formats kind and relation phrases", () => {
    expect(kindLabel("precedes")).toBe("Precedence");
    expect(inspectKind(parseLinkType("precedes_FS_Mandatory"))).toBe("Precedence");
    expect(inspectRelation("FS")).toBe("Finish-to-start");
    expect(inspectRelation("FF")).toBe("Finish-to-finish");
  });

  it("builds remove-menu labels", () => {
    expect(removeLinkMenuLabel(parseLinkType("precedes_FS_Mandatory"))).toBe(
      "Remove mandatory FS link",
    );
    expect(removeLinkMenuLabel(parseLinkType("supports"))).toBe("Remove supports link");
  });
});

describe("edgeDisplayData", () => {
  it("puts kind and hardness on edge data and omits FS labels", () => {
    expect(edgeDisplayData("precedes_FS_Mandatory_scope")).toEqual({
      label: "",
      kind: "precedes",
      relation: "FS",
      hardness: "Mandatory",
      linkType: "precedes_FS_Mandatory_scope",
    });
    expect(edgeDisplayData("precedes_SS_Optional").label).toBe("SS");
    expect(edgeDisplayData("supports").hardness).toBe("");
  });
});

describe("create-link grouping", () => {
  const types: LinkTypeMeta[] = [
    { link_type: "parent_of", in_type: "work_package", out_type: "work_package" },
    { link_type: "precedes_FS_Mandatory", in_type: "work_package", out_type: "work_package" },
    { link_type: "precedes_FF_Discretionary", in_type: "work_package", out_type: "work_package" },
    { link_type: "precedes_FF_Optional", in_type: "work_package", out_type: "work_package" },
    { link_type: "supports", in_type: "work_scope", out_type: "goal" },
  ];

  it("lists kinds and reconstructs wire ids", () => {
    const parsed = parseCompatibleLinkTypes(types);
    expect(uniqueCompatibleKinds(parsed)).toEqual(["precedes", "parent_of", "supports"]);
    expect(compatibleRelations(parsed, "precedes")).toEqual(["FS", "FF"]);
    expect(compatibleHardnesses(parsed, "precedes", "FF")).toEqual([
      "Discretionary",
      "Optional",
    ]);
    expect(resolveLinkTypeId(types, "precedes", "FF", "Optional")).toBe(
      "precedes_FF_Optional",
    );
    expect(resolveLinkTypeId(types, "supports")).toBe("supports");
    expect(resolveLinkTypeId(types, "precedes", "SS", "Mandatory")).toBeNull();
  });

  it("lists kinds present in a graph", () => {
    expect(
      presentLinkKinds(["precedes_FS_Mandatory", "supports_wp", "targets"]),
    ).toEqual(["precedes", "supports", "targets"]);
  });
});
