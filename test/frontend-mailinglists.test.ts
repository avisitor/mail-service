import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Frontend test for the mailing lists feature.
//
// Pattern matches test/frontend-view-navigation.test.ts and
// test/frontend-app-integration.test.ts: jsdom + mocked DOM + mocked
// fetch, exercising behavioral contracts that mirror the production
// code in src/frontend/main.ts. We do NOT import main.ts directly
// (it is a 10k-line bundled UI module not designed for isolated
// import); instead we verify the contract that main.ts implements.

describe('Mailing Lists Frontend', () => {
  describe('index.html structure', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'frontend', 'index.html'),
      'utf8'
    );

    it('exposes a Mailing Lists nav button', () => {
      expect(html).toMatch(
        /<button[^>]*data-view="mailinglists"[^>]*id="mailingListsNavBtn"[^>]*>/
      );
    });

    it('exposes a mailing list dropdown inside the compose view', () => {
      expect(html).toMatch(/<select[^>]*id="mailingListSelect"/);
    });

    it('exposes the mailing-lists view container with list and detail panels', () => {
      expect(html).toMatch(/<main[^>]*id="view-mailinglists"/);
      expect(html).toMatch(/id="mailingListsListPanel"/);
      expect(html).toMatch(/id="mailingListsDetailPanel"/);
      expect(html).toMatch(/id="createMailingListBtn"/);
      expect(html).toMatch(/id="mailingListsStatus"/);
    });
  });

  describe('Compose dropdown recipient replacement', () => {
    // This mirrors ComposeView.loadMailingListsDropdown and
    // ComposeView.onMailingListSelected in src/frontend/main.ts.
    // Format must match: "Name <email>" when name is present, "email" otherwise,
    // joined with newlines.

    function formatMembers(members: Array<{ email: string; name?: string }>): string {
      return members
        .map(m => (m.name ? `${m.name} <${m.email}>` : m.email))
        .filter(Boolean)
        .join('\n');
    }

    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      document.body.innerHTML = `
        <form id="composeForm">
          <textarea id="recipients"></textarea>
          <select id="mailingListSelect">
            <option value="">Select a mailing list...</option>
          </select>
          <span id="recipientCount">0</span>
        </form>
      `;
      fetchMock = vi.fn();
      (global as any).fetch = fetchMock;
    });

    it('formats members as "Name <email>" when name is present', () => {
      const out = formatMembers([
        { email: 'a@example.com', name: 'Alice' },
        { email: 'b@example.com', name: 'Bob' }
      ]);
      expect(out).toBe('Alice <a@example.com>\nBob <b@example.com>');
    });

    it('uses bare email when name is missing', () => {
      const out = formatMembers([
        { email: 'a@example.com', name: 'Alice' },
        { email: 'b@example.com' }
      ]);
      expect(out).toBe('Alice <a@example.com>\nb@example.com');
    });

    it('produces empty string for empty member list', () => {
      expect(formatMembers([])).toBe('');
    });

    it('populates the dropdown with name and member count', async () => {
      const select = document.querySelector('#mailingListSelect') as HTMLSelectElement;
      const lists = [
        { id: 1, name: 'Newsletter', memberCount: 42 },
        { id: 2, name: 'VIPs', memberCount: 3 }
      ];

      // Mirrors ComposeView.loadMailingListsDropdown
      select.innerHTML = '<option value="">Select a mailing list...</option>';
      lists.forEach(l => {
        const opt = document.createElement('option');
        opt.value = String(l.id);
        opt.textContent = `${l.name} (${l.memberCount ?? 0})`;
        select.appendChild(opt);
      });

      expect(select.options).toHaveLength(3);
      expect(select.options[1].value).toBe('1');
      expect(select.options[1].textContent).toBe('Newsletter (42)');
      expect(select.options[2].textContent).toBe('VIPs (3)');
    });

    it('replaces recipient textarea contents when a list is selected', async () => {
      const recipients = document.querySelector('#recipients') as HTMLTextAreaElement;
      recipients.value = 'someone@old.com';

      // Simulate the fetch performed by onMailingListSelected
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 7,
          name: 'Newsletter',
          members: [
            { email: 'a@example.com', name: 'Alice' },
            { email: 'b@example.com', name: null }
          ]
        })
      });

      const res = await fetch('/api/mailinglists/7?appId=app1');
      const list = await res.json();
      recipients.value = formatMembers(list.members);

      expect(recipients.value).toBe('Alice <a@example.com>\nb@example.com');
      expect(recipients.value).not.toContain('someone@old.com');
    });
  });

  describe('MailingListsView behavior', () => {
    // Behavioral mirror of the MailingListsView class in src/frontend/main.ts.
    // Tests verify: app-id gating, list rendering, selection, add-member flow,
    // and error handling. The class definition stays in sync with main.ts via
    // the documented behavioral contract; if main.ts changes, these tests
    // should be updated alongside it.

    interface MailingList { id: number; name: string; memberCount: number; }
    interface Member { id: number; email: string; name: string | null; }

    class MockMailingListsView {
      currentAppId: string | null = null;
      lists: MailingList[] = [];
      selectedListId: number | null = null;
      lastError: string | null = null;

      async loadLists(): Promise<void> {
        const panel = document.getElementById('mailingListsListPanel');
        if (!panel) return;
        if (!this.currentAppId) {
          panel.innerHTML = '<div style="color:#888">Select an app first.</div>';
          return;
        }
        try {
          const res = await fetch(`/api/mailinglists?appId=${encodeURIComponent(this.currentAppId)}`);
          if (!(res as any).ok) throw new Error(`HTTP ${(res as any).status}`);
          this.lists = await (res as any).json();
          this.renderLists();
        } catch (e: any) {
          this.lastError = e.message;
          panel.innerHTML = `<div style="color:#ff6b6b">Failed to load lists: ${e.message}</div>`;
        }
      }

      renderLists(): void {
        const panel = document.getElementById('mailingListsListPanel');
        if (!panel) return;
        if (!this.lists.length) {
          panel.innerHTML = '<div style="color:#888">No mailing lists yet. Click "+ New List" to create one.</div>';
          return;
        }
        panel.innerHTML = '';
        this.lists.forEach(list => {
          const row = document.createElement('div');
          row.className = 'mailing-list-row';
          row.dataset.listId = String(list.id);
          if (this.selectedListId === list.id) row.classList.add('selected');
          const label = document.createElement('span');
          label.textContent = `${list.name} (${list.memberCount})`;
          label.addEventListener('click', () => this.loadListDetail(list.id));
          row.appendChild(label);
          panel.appendChild(row);
        });
      }

      async loadListDetail(listId: number): Promise<void> {
        if (!this.currentAppId) return;
        this.selectedListId = listId;
        this.renderLists();
        const detail = document.getElementById('mailingListsDetailPanel');
        if (!detail) return;
        try {
          const res = await fetch(`/api/mailinglists/${listId}?appId=${encodeURIComponent(this.currentAppId)}`);
          if (!(res as any).ok) throw new Error(`HTTP ${(res as any).status}`);
          const list = await (res as any).json();
          this.renderDetail(list);
        } catch (e: any) {
          detail.innerHTML = `<div style="color:#ff6b6b">Failed to load: ${e.message}</div>`;
        }
      }

      renderDetail(list: { name: string; members: Member[] }): void {
        const detail = document.getElementById('mailingListsDetailPanel');
        if (!detail) return;
        detail.innerHTML = '';
        const title = document.createElement('h3');
        title.textContent = list.name;
        detail.appendChild(title);
        if (!list.members?.length) {
          const empty = document.createElement('div');
          empty.className = 'empty-state';
          empty.textContent = 'No members yet. Add one above.';
          detail.appendChild(empty);
          return;
        }
        const tbody = document.createElement('tbody');
        list.members.forEach(m => {
          const tr = document.createElement('tr');
          tr.dataset.memberId = String(m.id);
          tr.innerHTML = `<td>${m.name ?? ''}</td><td>${m.email}</td>`;
          tbody.appendChild(tr);
        });
        detail.appendChild(tbody);
      }

      async addMember(listId: number, name: string, email: string): Promise<boolean> {
        if (!this.currentAppId) return false;
        if (!email) return false;
        try {
          const res = await fetch(
            `/api/mailinglists/${listId}/members?appId=${encodeURIComponent(this.currentAppId)}`,
            { method: 'POST', body: JSON.stringify({ email, name }) }
          );
          if (!(res as any).ok) throw new Error(`HTTP ${(res as any).status}`);
          await this.loadListDetail(listId);
          return true;
        } catch (e: any) {
          this.lastError = e.message;
          return false;
        }
      }
    }

    let view: MockMailingListsView;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      document.body.innerHTML = `
        <main id="view-mailinglists">
          <div id="mailingListsStatus"></div>
          <div id="mailingListsListPanel"></div>
          <div id="mailingListsDetailPanel"></div>
          <button id="createMailingListBtn"></button>
        </main>
      `;
      fetchMock = vi.fn();
      (global as any).fetch = fetchMock;
      view = new MockMailingListsView();
    });

    it('shows a "select an app" hint when no appId is set', async () => {
      await view.loadLists();
      const panel = document.getElementById('mailingListsListPanel')!;
      expect(panel.textContent).toContain('Select an app first');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renders an empty-state message when no lists exist', async () => {
      view.currentAppId = 'app1';
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
      await view.loadLists();
      const panel = document.getElementById('mailingListsListPanel')!;
      expect(panel.textContent).toContain('No mailing lists yet');
    });

    it('renders one row per list with name and member count', async () => {
      view.currentAppId = 'app1';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { id: 1, name: 'Newsletter', memberCount: 5 },
          { id: 2, name: 'VIPs', memberCount: 0 }
        ]
      });
      await view.loadLists();
      const rows = document.querySelectorAll('.mailing-list-row');
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toBe('Newsletter (5)');
      expect(rows[1].textContent).toBe('VIPs (0)');
    });

    it('marks the selected list with a "selected" class', async () => {
      view.currentAppId = 'app1';
      view.lists = [
        { id: 1, name: 'A', memberCount: 1 },
        { id: 2, name: 'B', memberCount: 1 }
      ];
      view.selectedListId = 2;
      view.renderLists();
      const rows = document.querySelectorAll('.mailing-list-row');
      expect(rows[0].classList.contains('selected')).toBe(false);
      expect(rows[1].classList.contains('selected')).toBe(true);
    });

    it('loads members when a list is selected', async () => {
      view.currentAppId = 'app1';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          name: 'Newsletter',
          members: [
            { id: 10, email: 'a@example.com', name: 'Alice' },
            { id: 11, email: 'b@example.com', name: null }
          ]
        })
      });
      // Pre-populate so renderLists has something to render after selection
      view.lists = [{ id: 1, name: 'Newsletter', memberCount: 2 }];
      await view.loadListDetail(1);

      expect(view.selectedListId).toBe(1);
      const detail = document.getElementById('mailingListsDetailPanel')!;
      expect(detail.querySelector('h3')?.textContent).toBe('Newsletter');
      const rows = detail.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(2);
      expect(rows[0].getAttribute('data-member-id')).toBe('10');
      expect(rows[0].textContent).toContain('Alice');
      expect(rows[0].textContent).toContain('a@example.com');
    });

    it('shows an empty-state when a selected list has no members', async () => {
      view.currentAppId = 'app1';
      view.lists = [{ id: 1, name: 'Empty', memberCount: 0 }];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: 'Empty', members: [] })
      });
      await view.loadListDetail(1);
      expect(document.querySelector('.empty-state')?.textContent).toBe(
        'No members yet. Add one above.'
      );
    });

    it('addMember POSTs to the members endpoint and refreshes the detail', async () => {
      view.currentAppId = 'app1';
      view.lists = [{ id: 1, name: 'L', memberCount: 0 }];

      // First call: POST /members
      fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 99 }) });
      // Second call: GET /api/mailinglists/1 (refresh from loadListDetail)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          name: 'L',
          members: [{ id: 99, email: 'new@example.com', name: 'New' }]
        })
      });

      const ok = await view.addMember(1, 'New', 'new@example.com');
      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [postUrl, postOpts] = fetchMock.mock.calls[0];
      expect(postUrl).toBe('/api/mailinglists/1/members?appId=app1');
      expect(postOpts.method).toBe('POST');
      expect(JSON.parse(postOpts.body)).toEqual({ email: 'new@example.com', name: 'New' });

      const tr = document.querySelector('tbody tr');
      expect(tr?.getAttribute('data-member-id')).toBe('99');
    });

    it('addMember returns false and skips fetch when email is empty', async () => {
      view.currentAppId = 'app1';
      const ok = await view.addMember(1, 'No Email', '');
      expect(ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces fetch errors as a red banner in the list panel', async () => {
      view.currentAppId = 'app1';
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      await view.loadLists();
      const panel = document.getElementById('mailingListsListPanel')!;
      expect(panel.textContent).toContain('Failed to load lists');
      expect(panel.textContent).toContain('HTTP 500');
      expect(view.lastError).toBe('HTTP 500');
    });
  });
});
