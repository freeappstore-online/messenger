import { test, expect } from '@playwright/test';

// Test the family invite and approval flow
test('should allow inviting and approving new family members', async ({ page, browser }) => {
  // First user logs in
  await page.goto('/');
  await page.fill('input[type="email"]', 'test1@user.com');
  await page.fill('input[type="password"]', 'testuser1');
  await page.click('button[type="submit"]');
  
  // Wait for login to complete and page to load
  await page.waitForSelector('button.toggle-invite-btn');
  await page.click('button.toggle-invite-btn');
  
  // Fill out invite form
  await page.waitForSelector('#inviteeId');
  await page.fill('#inviteeId', 'test-invitee-id');
  await page.fill('#inviteeName', 'Test Invitee');
  await page.click('[data-testid="invite-btn"]');
  
  // Verify success message
  await page.waitForSelector('.success-message');
  const successText = await page.textContent('.success-message');
  expect(successText).toContain('Invitation sent');
  
  // Second user logs in to approve the invitation
  const page2 = await browser.newPage();
  await page2.goto('/');
  await page2.fill('input[type="email"]', 'test2@user.com');
  await page2.fill('input[type="password"]', 'testuser2');
  await page2.click('button[type="submit"]');
  
  // Wait for login to complete and pending invites to load
  await page2.waitForSelector('.pending-invites-section');
  
  // Find the invite for test-invitee-id
  const inviteItem = page2.locator('.invite-item', { 
    has: page2.locator('text=Test Invitee') 
  });
  expect(await inviteItem.count()).toBe(1);
  
  // Approve the invitation
  await inviteItem.locator('[data-testid^="approve-"]').click();
  
  // Verify approval was recorded
  await page2.waitForSelector('.approved-badge');
  
  // Go back to first page and verify invite status was updated
  await page.reload();
  await page.waitForSelector('.pending-invites-section');
  
  const updatedInviteItem = page.locator('.invite-item', {
    has: page.locator('text=Test Invitee') 
  });
  
  // Check approval count
  const approvalText = await updatedInviteItem.locator('.approval-text').textContent();
  expect(approvalText).toContain('2/2 approvals');
  
  // Verify fully approved badge is shown
  await updatedInviteItem.waitForSelector('.fully-approved-badge');
  const badgeText = await updatedInviteItem.locator('.fully-approved-badge').textContent();
  expect(badgeText).toBe('Fully Approved!');
  
  // Reload and check that the invitee is now in the family member list
  await page.reload();
  await page.waitForSelector('p:has-text("demo-family-1")');
  
  // Check that the family member count increased to include the new member
  const familyText = await page.textContent('p:has-text("demo-family-1")');
  expect(familyText).toContain('3 members'); // Original 2 users + the new invitee
});
