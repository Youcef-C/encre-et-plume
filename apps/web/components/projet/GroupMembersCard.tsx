'use client';

// CS-10 — replica of the prototype's GROUPE & PERMISSIONS members table (.dc.html 2280–2292):
// paper header row (Membre | Lecture | Écriture | Corrections | Fusion | Admin), 3px ink card with
// a 6px hard offset shadow, halftone member rows, and the accent "＋ Inviter un membre" footer.
// Deviations (plan §4): D1 the meta line carries the Leader/Co-leader/Member control, D4 (revised
// round 2) every pictogram — the prototype's pen/brush glyphs AND its check/cross marks — comes from
// icons.tsx; no check/cross character is ever rendered as text. The permission cells are real
// `role="switch"` toggles keeping the prototype's pill look — via the shared OnBrandSwitch, whose
// design this very cell defined; leader rows show the implied check icon.
// Header and rows share ONE `.ep-group-grid` template so every switch sits under its column (U-3).
import {
  GROUP_PERMISSIONS,
  GROUP_PERMISSION_LABELS,
  GROUP_ROLES,
  GROUP_ROLE_LABELS,
  type GroupMemberDto,
  type GroupMembersResponse,
  type GroupPermission,
  type GroupRole,
} from '@encre-et-plume/shared';
import OnBrandSelect from '../form/OnBrandSelect';
import OnBrandSwitch from '../form/OnBrandSwitch';
import { CheckIcon, CreatorRoleIcon, XIcon } from '../icons';

const GREEN = '#1f8a5b';

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 12,
  overflow: 'hidden',
  boxShadow: '6px 6px 0 var(--shadow)',
};

const headCell: React.CSSProperties = { textAlign: 'center' };

/** Prototype member disc: 34px var(--tone) circle with a 2px ink border (real avatar when set). */
function MemberAvatar({ avatar }: { avatar: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        flex: 'none',
        border: '2px solid var(--ink)',
        ...(avatar ? { background: `center/cover url(${avatar})` } : { background: 'var(--tone)' }),
      }}
    />
  );
}

/** The prototype's pill toggle — now THE app-wide switch (user, 2026-08-01): this cell's look is
 *  where `OnBrandSwitch` took its design, so it draws the shared control rather than a copy. */
function PermissionSwitch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <OnBrandSwitch
      label={label}
      checked={on}
      disabled={disabled}
      onChange={onToggle}
      hideLabel
      className="ep-perm-switch"
    />
  );
}

// U-4: the granted/denied marks are pictograms, never the "✓"/"✕" characters. The dash stays
// typography (an em dash is not a check mark) and the meaning is carried by the column header +
// the per-cell label rendered on mobile — never by colour alone.
const Yes = () => (
  <span data-testid="perm-yes" style={{ color: GREEN, display: 'inline-flex' }}>
    <CheckIcon size={16} />
  </span>
);
const No = () => <span style={{ color: 'var(--ink2)' }}>—</span>;

/** The green "· ✓ Accepté" status chip from the prototype, with the check as an icon. */
const AcceptedChip = () => (
  <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
    ·<CheckIcon size={12} />
    Accepté
  </span>
);

export interface GroupMembersCardProps {
  group: GroupMembersResponse;
  /** Session account id — drives the "Vous" label (the API never marks the viewer's row). */
  selfAccountId: string | null;
  busyMemberId: string | null;
  error: string | null;
  onChangeRole: (member: GroupMemberDto, role: GroupRole) => void;
  onTogglePermission: (member: GroupMemberDto, perm: GroupPermission) => void;
  onRevoke: (member: GroupMemberDto) => void;
  onInvite: () => void;
}

export default function GroupMembersCard({
  group,
  selfAccountId,
  busyMemberId,
  error,
  onChangeRole,
  onTogglePermission,
  onRevoke,
  onInvite,
}: GroupMembersCardProps) {
  const canManage = group.viewer.canManage;
  const alone = group.members.length === 1 && group.pending.length === 0;

  return (
    <>
      <div style={card}>
        {/* Column header (proto 2280) */}
        <div
          className="ep-group-head ep-group-grid"
          style={{
            padding: '11px 16px',
            borderBottom: '3px solid var(--ink)',
            background: 'var(--paper)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--ink2)',
            textTransform: 'uppercase',
          }}
        >
          <span>Membre</span>
          <span className="ep-group-cell" style={headCell}>
            Lecture
          </span>
          <span className="ep-group-cell" style={headCell}>
            Écriture
          </span>
          <span className="ep-group-cell" style={headCell}>
            Corrections
          </span>
          <span className="ep-group-cell" style={{ ...headCell, color: 'var(--accent)' }}>
            Fusion
          </span>
          <span className="ep-group-cell" style={headCell}>
            Admin
          </span>
          {/* Trailing actions column — empty in the header so the rows' revoke button has a slot. */}
          <span aria-hidden="true" />
        </div>

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '10px 16px',
              borderBottom: '1.5px solid var(--border)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--danger)',
            }}
          >
            {error}
          </p>
        )}

        {group.members.map((m, i) => {
          const isLead = m.groupRole === 'leader' || m.groupRole === 'coleader';
          const busy = busyMemberId === m.id;
          const last = i === group.members.length - 1 && group.pending.length === 0;
          return (
            <div
              key={m.id}
              className="ep-group-row ep-group-grid"
              aria-busy={busy || undefined}
              style={{
                padding: '13px 16px',
                ...(last ? {} : { borderBottom: '1.5px solid var(--border)' }),
                opacity: busy ? 0.6 : 1,
              }}
            >
              <div className="ep-group-member" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <MemberAvatar avatar={m.avatar} />
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>{m.accountId === selfAccountId ? 'Vous' : m.name}</b>
                  <span style={{ fontSize: 11, color: 'var(--ink2)', display: 'inline-flex' }}>
                    <CreatorRoleIcon role={m.creatorRole} />
                  </span>
                  {canManage ? (
                    <span className="ep-group-role-select" style={{ display: 'inline-block' }}>
                      <OnBrandSelect
                        aria-label={`Statut de ${m.name}`}
                        value={m.groupRole}
                        disabled={busy}
                        onChange={(e) => onChangeRole(m, e.target.value as GroupRole)}
                        style={{ fontSize: 12, minHeight: 34, padding: '4px 10px', width: 'auto' }}
                      >
                        {GROUP_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {GROUP_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </OnBrandSelect>
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>{GROUP_ROLE_LABELS[m.groupRole]}</span>
                  )}
                  <AcceptedChip />
                </div>
              </div>

              {/* Lecture — membership always implies read. */}
              <span className="ep-group-cell" style={headCell}>
                <span className="ep-group-cell-label">Lecture</span>
                <Yes />
              </span>

              {GROUP_PERMISSIONS.map((perm) => (
                <span key={perm} className="ep-group-cell" style={headCell}>
                  <span className="ep-group-cell-label">{GROUP_PERMISSION_LABELS[perm]}</span>
                  {isLead ? (
                    <Yes />
                  ) : canManage ? (
                    <PermissionSwitch
                      on={m.permissions.includes(perm)}
                      label={`${GROUP_PERMISSION_LABELS[perm]} — ${m.name}`}
                      disabled={busy}
                      onToggle={() => onTogglePermission(m, perm)}
                    />
                  ) : m.effectivePermissions.includes(perm) ? (
                    <Yes />
                  ) : (
                    <No />
                  )}
                </span>
              ))}

              {/* Admin — derived from leadership, never a stored toggle. */}
              <span className="ep-group-cell" style={headCell}>
                <span className="ep-group-cell-label">Admin</span>
                {isLead ? <Yes /> : <No />}
              </span>

              {canManage && !m.isOwner && (
                <span className="ep-group-actions">
                  {/* The app's two-step destructive idiom (MC-7 "Retirer", CallDetailModal
                      "Supprimer"): outline trigger → `.ep-btn-danger` confirm. Colour comes from
                      the shared class only; layout stays inline. */}
                  <button
                    type="button"
                    aria-label={`Révoquer ${m.name}`}
                    disabled={busy}
                    onClick={() => onRevoke(m)}
                    className="ep-btn-danger-outline"
                    style={{
                      minHeight: 44,
                      minWidth: 44,
                      padding: '6px 10px',
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <XIcon size={14} />
                  </button>
                </span>
              )}
            </div>
          );
        })}

        {/* Pending invitees — display only (the invitation lifecycle stays with MC-3). */}
        {group.pending.map((p, i) => (
          <div
            key={p.invitationId}
            className="ep-group-row ep-group-grid"
            style={{
              padding: '13px 16px',
              ...(i === group.pending.length - 1 ? {} : { borderBottom: '1.5px solid var(--border)' }),
            }}
          >
            <div className="ep-group-member" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <MemberAvatar avatar={p.avatar} />
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 14 }}>{p.name}</b>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#c08a1e' }}>· En attente</span>
              </div>
            </div>
            <span className="ep-group-cell" style={headCell}>
              <span className="ep-group-cell-label">Lecture</span>
              <No />
            </span>
            {GROUP_PERMISSIONS.map((perm) => (
              <span key={perm} className="ep-group-cell" style={headCell}>
                <span className="ep-group-cell-label">{GROUP_PERMISSION_LABELS[perm]}</span>
                <No />
              </span>
            ))}
            <span className="ep-group-cell" style={headCell}>
              <span className="ep-group-cell-label">Admin</span>
              <No />
            </span>
          </div>
        ))}

        {/* Footer (proto 2293) */}
        <div style={{ padding: '13px 16px', borderTop: '2px solid var(--border)', background: 'var(--paper)' }}>
          {alone && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5 }}>
              Vous êtes seul·e dans le groupe pour l&apos;instant. Invitez un·e co-auteur·rice pour commencer.
            </p>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onInvite}
              className="ep-btn-primary"
              style={{ fontSize: 13, fontWeight: 700, borderRadius: 6, padding: '8px 16px', minHeight: 44 }}
            >
              ＋ Inviter un membre
            </button>
          )}
        </div>
      </div>

      {/* Merge note (proto 2295) — verbatim. */}
      <div
        style={{
          marginTop: 16,
          border: '2px dashed var(--ink)',
          borderRadius: 10,
          padding: '14px 16px',
          fontSize: 13,
          color: 'var(--ink2)',
          lineHeight: 1.5,
        }}
      >
        <b style={{ color: 'var(--ink)' }}>Autorisation de fusion (merge) :</b> seuls les membres avec le droit
        «&nbsp;Fusion&nbsp;» peuvent valider et intégrer une nouvelle version dans la branche principale du projet.
      </div>
    </>
  );
}
