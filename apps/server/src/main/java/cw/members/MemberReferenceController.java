package cw.members;

import org.springframework.web.bind.annotation.*;

@RestController
public class MemberReferenceController {
  private final MemberReferenceImporter importer;

  public MemberReferenceController(MemberReferenceImporter importer) {
    this.importer = importer;
  }

  @PostMapping("/api/admin/member-references")
  public Object importReferences(@RequestBody MemberReferenceImporter.ImportInput input) {
    return importer.importReferences(input);
  }

  @GetMapping("/api/admin/members/{id}/role-suggestion")
  public Object suggest(@PathVariable String id) {
    return importer.suggest(id);
  }
}
