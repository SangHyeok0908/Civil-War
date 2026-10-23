package cw.members;

import cw.contracts.*;
import cw.contracts.MemberContracts.*;
import cw.db.MutationCoordinator;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(readOnly = true)
public class MemberService {
    private final MemberRepository members;
    private final MutationCoordinator mutations;
    private final JsonMapper json;

    public MemberService(MemberRepository members, MutationCoordinator mutations, JsonMapper json) {
        this.members = members;
        this.mutations = mutations;
        this.json = json;
    }

    public Member view(MemberEntity m) {
        return new Member(
                m.id,
                m.puuid,
                m.riotId,
                m.displayName,
                m.active,
                m.primaryRole,
                m.secondaryRole,
                roles(m.allowedRoles),
                m.seedSkill,
                m.profileRevision);
    }

    public PublicMember publicView(MemberEntity m) {
        return new PublicMember(
                m.id,
                m.displayName,
                m.active,
                m.primaryRole,
                m.secondaryRole,
                roles(m.allowedRoles));
    }

    public List<Member> list() {
        return members.findAll(org.springframework.data.domain.Sort.by("id")).stream()
                .map(this::view)
                .toList();
    }

    public List<PublicMember> publicList() {
        return members.findAll(org.springframework.data.domain.Sort.by("id")).stream()
                .map(this::publicView)
                .toList();
    }

    public Member get(String id) {
        return view(members.findById(id).orElseThrow(() -> new ApiException(404, "NOT_FOUND")));
    }

    @Transactional
    public Member create(JsonNode input) {
        var state = mutations.lock();
        validateFields(input, true);
        var m = new MemberEntity();
        m.id = UUID.randomUUID().toString();
        m.puuid = text(input, "puuid", 255);
        m.riotId = text(input, "riotId", 255);
        m.displayName = text(input, "displayName", 100);
        m.active = true;
        m.allowedRoles = "";
        m.seedSkill = seed(input.get("seedSkill"));
        apply(m, input, true);
        if (members.findByPuuid(m.puuid).isPresent()) {
            throw new ApiException(409, "CONFLICT");
        }
        m.profileRevision = 1;
        members.save(m);
        mutations.changed(state);
        mutations.audit("member_created", "owner", m.id, "{}");
        return view(m);
    }

    @Transactional
    public Member patch(String id, JsonNode input) {
        var state = mutations.lock();
        validateFields(input, false);
        var m = members.findById(id).orElseThrow(() -> new ApiException(404, "NOT_FOUND"));
        var before = view(m);
        apply(m, input, false);
        var after = view(m);
        if (!before.equals(after)) {
            boolean teamChanged =
                    before.active() != after.active()
                            || before.seedSkill() != after.seedSkill()
                            || before.primaryRole() != after.primaryRole()
                            || before.secondaryRole() != after.secondaryRole()
                            || !before.allowedRoles().equals(after.allowedRoles());
            m.profileRevision++;
            if (teamChanged) {
                mutations.changed(state);
            }
            mutations.audit(
                    "member_updated",
                    "owner",
                    m.id,
                    "{\"profileRevision\":" + m.profileRevision + "}");
        }
        return view(m);
    }

    private void apply(MemberEntity m, JsonNode input, boolean create) {
        if (input.has("riotId")) {
            m.riotId = text(input, "riotId", 255);
        }
        if (input.has("displayName")) {
            m.displayName = text(input, "displayName", 100);
        }
        if (input.has("active")) {
            if (!input.get("active").isBoolean()) {
                invalid();
            }
            m.active = input.get("active").asBoolean();
        }
        if (input.has("seedSkill")) {
            m.seedSkill = seed(input.get("seedSkill"));
        }
        if (input.has("primaryRole")) {
            m.primaryRole = role(input.get("primaryRole"));
        }
        if (input.has("secondaryRole")) {
            m.secondaryRole = role(input.get("secondaryRole"));
        }
        if (m.primaryRole != null && m.primaryRole == m.secondaryRole) {
            invalid();
        }
        if (input.has("allowedRoles")) {
            var a = input.get("allowedRoles");
            if (!a.isArray() || a.size() > 5) {
                invalid();
            }
            Set<Role> values = new LinkedHashSet<>();
            for (var node : a) {
                var r = role(node);
                if (r == null || !values.add(r)) {
                    invalid();
                }
            }
            m.allowedRoles = String.join(",", values.stream().sorted().map(Enum::name).toList());
        } else if (create) {
            Set<Role> values = new TreeSet<>();
            if (m.primaryRole != null) {
                values.add(m.primaryRole);
            }
            if (m.secondaryRole != null) {
                values.add(m.secondaryRole);
            }
            m.allowedRoles = String.join(",", values.stream().map(Enum::name).toList());
        }
        var allowed = roles(m.allowedRoles);
        if ((m.primaryRole != null && !allowed.contains(m.primaryRole))
                || (m.secondaryRole != null && !allowed.contains(m.secondaryRole))) {
            invalid();
        }
    }

    private void validateFields(JsonNode input, boolean create) {
        if (input == null || !input.isObject()) {
            invalid();
        }
        Set<String> allowed =
                new HashSet<>(
                        Set.of(
                                "riotId",
                                "displayName",
                                "active",
                                "primaryRole",
                                "secondaryRole",
                                "allowedRoles",
                                "seedSkill"));
        if (create) {
            allowed.add("puuid");
        }
        for (String name : input.propertyNames()) {
            if (!allowed.contains(name)) {
                invalid();
            }
        }
    }

    private static List<Role> roles(String encoded) {
        return encoded.isEmpty()
                ? List.of()
                : Arrays.stream(encoded.split(",")).map(Role::valueOf).sorted().toList();
    }

    private static Role role(JsonNode value) {
        if (value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            invalid();
        }
        try {
            return Role.valueOf(value.asString());
        } catch (IllegalArgumentException e) {
            invalid();
            return null;
        }
    }

    private static int seed(JsonNode value) {
        if (value == null
                || !value.isIntegralNumber()
                || !value.canConvertToInt()
                || value.asInt() < 0
                || value.asInt() > 100) {
            invalid();
        }
        return value.asInt();
    }

    private static String text(JsonNode input, String name, int max) {
        var n = input.get(name);
        if (n == null || !n.isString() || n.asString().isBlank() || n.asString().length() > max) {
            invalid();
        }
        return n.asString();
    }

    private static void invalid() {
        throw new ApiException(422, "INVALID_MEMBER");
    }
}
