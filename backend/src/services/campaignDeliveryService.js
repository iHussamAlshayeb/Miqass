const Campaign = require("../models/Campaign");

const normalizeIdentifiers = (identifiers = []) => [
  ...new Set(
    identifiers
      .map((identifier) => String(identifier ?? "").trim())
      .filter(Boolean),
  ),
];

const buildIdentifierConditions = (prefix, identifiers) => [
  { [`${prefix}.providerMessageId`]: { $in: identifiers } },
  { [`${prefix}.providerWhatsappMessageId`]: { $in: identifiers } },
];

const updateCampaignMessageDelivery = async ({
  tenantId,
  identifiers,
  whatsappMessageId = null,
  status,
  eventAt = new Date(),
}) => {
  const messageIdentifiers = normalizeIdentifiers(identifiers);
  if (!tenantId || messageIdentifiers.length === 0 || !status) {
    return { matched: false, statusUpdated: false };
  }

  const campaignMatch = {
    tenantId,
    $or: buildIdentifierConditions("targetCustomers", messageIdentifiers),
  };
  const recipientIdentifierFilter = {
    $or: buildIdentifierConditions("recipient", messageIdentifiers),
  };
  let matched = false;

  if (whatsappMessageId) {
    const identifierUpdate = await Campaign.updateOne(
      campaignMatch,
      {
        $set: {
          "targetCustomers.$[recipient].providerWhatsappMessageId":
            String(whatsappMessageId),
        },
      },
      { arrayFilters: [recipientIdentifierFilter] },
    );
    matched = identifierUpdate.matchedCount > 0;
    messageIdentifiers.push(String(whatsappMessageId));
  }

  const statusProgressFilter =
    status.code === 0
      ? {
          $or: [
            { "recipient.providerStatusCode": { $exists: false } },
            { "recipient.providerStatusCode": null },
            { "recipient.providerStatusCode": { $in: [0, 1, 2] } },
          ],
        }
      : {
          $or: [
            { "recipient.providerStatusCode": { $exists: false } },
            { "recipient.providerStatusCode": null },
            { "recipient.providerStatusCode": { $lt: status.code } },
          ],
        };
  const setFields = {
    "targetCustomers.$[recipient].providerStatus": status.status,
    "targetCustomers.$[recipient].providerStatusCode": status.code,
    "targetCustomers.$[recipient].providerStatusUpdatedAt": eventAt,
  };

  if (status.code >= 3) {
    setFields["targetCustomers.$[recipient].deliveredAt"] = eventAt;
  }
  if (status.code >= 4) {
    setFields["targetCustomers.$[recipient].readAt"] = eventAt;
  }
  if (status.code === 0) {
    setFields["targetCustomers.$[recipient].deliveryFailedAt"] = eventAt;
  } else {
    setFields["targetCustomers.$[recipient].deliveryFailedAt"] = null;
  }

  const statusUpdate = await Campaign.updateOne(
    {
      tenantId,
      $or: buildIdentifierConditions("targetCustomers", messageIdentifiers),
    },
    { $set: setFields },
    {
      arrayFilters: [
        {
          $and: [
            {
              $or: buildIdentifierConditions(
                "recipient",
                messageIdentifiers,
              ),
            },
            statusProgressFilter,
          ],
        },
      ],
    },
  );

  return {
    matched: matched || statusUpdate.matchedCount > 0,
    statusUpdated: statusUpdate.modifiedCount > 0,
  };
};

module.exports = { updateCampaignMessageDelivery };
