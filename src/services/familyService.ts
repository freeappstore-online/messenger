import { Firestore, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, serverTimestamp, arrayUnion, deleteDoc } from 'firebase/firestore';

/**
 * Interface for a family member document
 */
export interface FamilyMember {
  userId: string;
  displayName: string;
  joinedAt: number;
}

/**
 * Interface for a family invite document
 */
export interface FamilyInvite {
  inviteId: string;
  inviteeId: string;
  inviteeName: string;
  inviterId: string;
  inviterName: string;
  createdAt: number;
  approvals: string[]; // Array of userIds who have approved
  familyId: string;
}

/**
 * Service to manage family members and invites in Firestore
 */
export class FamilyService {
  private db: Firestore;
  
  /**
   * Creates a new FamilyService
   * 
   * @param db Firestore instance
   */
  constructor(db: Firestore) {
    this.db = db;
  }
  
  // FamilyService methods directly use collection() instead of helper methods

  /**
   * Adds a user to a family
   * 
   * @param familyId The family ID
   * @param member The family member to add
   * @returns A promise that resolves when the member is added
   */
  async addMember(familyId: string, member: FamilyMember): Promise<void> {
    const memberRef = doc(this.db, `families/${familyId}/members/${member.userId}`);
    return setDoc(memberRef, member);
  }

  /**
   * Removes a user from a family
   * 
   * @param familyId The family ID
   * @param userId The user ID to remove
   * @returns A promise that resolves when the member is removed
   */
  async removeMember(familyId: string, userId: string): Promise<void> {
    const memberRef = doc(this.db, `families/${familyId}/members/${userId}`);
    return deleteDoc(memberRef);
  }

  /**
   * Gets all members of a family
   * 
   * @param familyId The family ID
   * @returns A promise that resolves to an array of family members
   */
  async getMembers(familyId: string): Promise<FamilyMember[]> {
    try {
      console.log(`[FamilyService] Getting family members for family ${familyId}`);
      const membersCollection = collection(this.db, `families/${familyId}/members`);
      const memberDocs = await getDocs(membersCollection);
      console.log(`[FamilyService] Found ${memberDocs.size} family members`);
      return memberDocs.docs.map(doc => ({
        userId: doc.id,
        ...doc.data() as Omit<FamilyMember, 'userId'>
      }));
    } catch (error) {
      console.error('[FamilyService] Error getting family members:', error);
      return [];
    }
  }

  /**
   * Checks if a user is a member of a family
   * 
   * @param familyId The family ID
   * @param userId The user ID to check
   * @returns A promise that resolves to true if the user is a member, false otherwise
   */
  async isMember(familyId: string, userId: string): Promise<boolean> {
    const memberRef = doc(this.db, `families/${familyId}/members/${userId}`);
    const snapshot = await getDoc(memberRef);
    return snapshot.exists();
  }

  /**
   * Creates an invitation for a user to join a family
   * 
   * @param familyId The family ID
   * @param inviterId The ID of the user creating the invite
   * @param inviterName The name of the user creating the invite
   * @param inviteeId The ID of the user being invited
   * @param inviteeName The name of the user being invited
   * @returns A promise that resolves when the invite is created
   */
  async inviteToFamily(familyId: string, inviterId: string, inviterName: string, inviteeId: string, inviteeName: string): Promise<void> {
    try {
      console.log(`[FamilyService] Creating invite for ${inviteeId} to family ${familyId} by ${inviterId}`);
      // First, check if user has permission to create invites in this family
      const memberDocRef = doc(this.db, `families/${familyId}/members/${inviterId}`);
      const memberDoc = await getDoc(memberDocRef);
      
      if (!memberDoc.exists()) {
        console.error(`[FamilyService] Permission error: ${inviterId} is not a member of family ${familyId}`);
        throw new Error(`User ${inviterId} is not a member of this family and cannot invite others`);
      }
      
      console.log(`[FamilyService] User ${inviterId} is confirmed as family member, creating invite...`);
      const inviteDocRef = doc(this.db, `families/${familyId}/invites/${inviteeId}`);
      await setDoc(inviteDocRef, {
        inviterId,
        inviterName,
        inviteeId,
        inviteeName,
        createdAt: serverTimestamp(),
        approvals: [inviterId] // Inviter auto-approves
      });
      console.log(`[FamilyService] Successfully created invite for ${inviteeId}`);
    } catch (error) {
      console.error('[FamilyService] Error creating family invite:', error);
      throw error;
    }
  }

  /**
   * Approves an invitation to join a family
   * 
   * @param familyId The family ID
   * @param inviteId The invite ID
   * @param userId The ID of the user approving the invite
   * @returns A promise that resolves when the invite is approved
   */
  async approveInvite(familyId: string, inviteId: string, userId: string): Promise<void> {
    try {
      console.log(`[FamilyService] User ${userId} attempting to approve invite ${inviteId} in family ${familyId}`);
      
      // 1. Check if user is a member of the family
      const memberRef = doc(this.db, `families/${familyId}/members/${userId}`);
      const memberDoc = await getDoc(memberRef);
      
      if (!memberDoc.exists()) {
        console.error(`[FamilyService] Permission denied: User ${userId} is not a member of family ${familyId}`);
        throw new Error('Only family members can approve invitations');
      }
      
      // 2. Get the invite to check if the user is not approving their own invite
      const inviteRef = doc(this.db, `families/${familyId}/invites/${inviteId}`);
      const inviteDoc = await getDoc(inviteRef);
      
      if (!inviteDoc.exists()) {
        console.error(`[FamilyService] Invite ${inviteId} not found`);
        throw new Error('Invitation not found');
      }
      
      const inviteData = inviteDoc.data();
      
      // Check if the user is the inviter - they shouldn't approve their own invites
      if (inviteData.inviterId === userId) {
        console.error(`[FamilyService] Self-approval rejected: User ${userId} is the inviter`);
        throw new Error('You cannot approve your own invitation - it is automatically approved');
      }
      
      // Check if user has already approved
      if (inviteData.approvals && inviteData.approvals.includes(userId)) {
        console.log(`[FamilyService] User ${userId} has already approved invite ${inviteId}`);
        return; // No need to approve again
      }
      
      // 3. Add approval
      console.log(`[FamilyService] Adding approval from user ${userId} to invite ${inviteId}`);
      await updateDoc(inviteRef, {
        approvals: arrayUnion(userId)
      });
      console.log(`[FamilyService] Successfully added approval from ${userId}`);
    } catch (error) {
      console.error('[FamilyService] Error approving invitation:', error);
      throw error;
    }
  }

  /**
   * Gets all pending invites for a family
   * 
   * @param familyId The family ID
   * @returns A promise that resolves to an array of invites
   */
  async getInvites(familyId: string): Promise<FamilyInvite[]> {
    try {
      console.log(`[FamilyService] Getting invites for family ${familyId}`);
      const invitesCollection = collection(this.db, `families/${familyId}/invites`);
      const inviteDocs = await getDocs(invitesCollection);
      console.log(`[FamilyService] Found ${inviteDocs.size} invites`);

      return inviteDocs.docs.map(doc => ({
        inviteId: doc.id,
        ...doc.data() as Omit<FamilyInvite, 'inviteId'>
      }));
    } catch (error) {
      console.error('[FamilyService] Error getting family invites:', error);
      return [];
    }
  }

  /**
   * Gets a pending invite for a specific user in a family
   * 
   * @param familyId The family ID
   * @param inviteeId The ID of the invitee
   * @returns A promise that resolves to the invite or null if none exists
   */
  async getPendingInvite(familyId: string, inviteeId: string): Promise<FamilyInvite | null> {
    const invitesQuery = query(collection(this.db, `families/${familyId}/invites`));
    const snapshot = await getDocs(invitesQuery);
    
    const invites = snapshot.docs
      .map(doc => doc.data() as FamilyInvite)
      .filter(invite => invite.inviteeId === inviteeId);
    
    return invites.length > 0 ? invites[0] : null;
  }

  /**
   * Completes an invite by adding the invitee to the family and removing the invite
   * 
   * @param familyId The family ID
   * @param inviteId The invite ID
   * @returns A promise that resolves when the invite is completed
   */
  async completeInvite(familyId: string, inviteId: string): Promise<void> {
    // Remove the invite once it's completed
    const inviteRef = doc(this.db, `families/${familyId}/invites/${inviteId}`);
    return deleteDoc(inviteRef);
  }

  /**
   * Rejects an invite by removing it
   * 
   * @param familyId The family ID
   * @param inviteId The invite ID
   * @returns A promise that resolves when the invite is rejected
   */
  async rejectInvite(familyId: string, inviteId: string): Promise<void> {
    // Remove the invite if rejected
    const inviteRef = doc(this.db, `families/${familyId}/invites/${inviteId}`);
    return deleteDoc(inviteRef);
  }

  /**
   * Gets metadata about a family
   * 
   * @param familyId The family ID
   * @returns A promise that resolves to the family metadata or null if the family doesn't exist
   */
  async getFamilyMetadata(familyId: string): Promise<{ name: string; createdAt: number; } | null> {
    const familyRef = doc(this.db, `families/${familyId}`);
    const snapshot = await getDoc(familyRef);
    
    if (!snapshot.exists()) return null;
    return snapshot.data() as { name: string; createdAt: number; };
  }
}

/**
 * Creates a new FamilyService instance
 * 
 * @param db Firestore instance
 * @returns A new FamilyService instance
 */
export const createFamilyService = (db: Firestore): FamilyService => {
  return new FamilyService(db);
};
