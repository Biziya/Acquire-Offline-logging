using System.Security.Claims;
using BackendApi.Controllers.Status;
using BackendApi.Models.Status;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace BackendApi.Tests.Status;

public sealed class StatusControllerTests
{
    [Theory]
    [InlineData(@"CORP\jdoe")]
    [InlineData("local")]
    public void ReturnsAuthenticatedPrincipalForDisplayCache(string name)
    {
        var controller = ControllerFor(name);
        var result = Assert.IsType<OkObjectResult>(controller.Get(includeUser: true));
        var body = Assert.IsType<StatusResponse>(result.Value);
        Assert.Equal(name, body.FullUsername);
    }

    [Fact]
    public void RetainsLocalAuthorityWithoutChangingMetadataName()
    {
        var fullName = $@"{Environment.MachineName}\local";
        var result = Assert.IsType<OkObjectResult>(ControllerFor(fullName).Get(true));
        var body = Assert.IsType<StatusResponse>(result.Value);
        Assert.Equal(fullName, body.FullUsername);
        Assert.Equal("local", body.UserName);
    }

    [Fact]
    public void AnonymousStatusDoesNotExposeIdentity()
    {
        var result = Assert.IsType<OkObjectResult>(ControllerFor(@"CORP\jdoe").Get());
        var body = Assert.IsType<StatusResponse>(result.Value);
        Assert.Null(body.UserName);
        Assert.Null(body.FullUsername);
    }

    [Fact]
    public void UnauthenticatedIdentityStillRequiresWindowsAuthentication()
    {
        var controller = new StatusController
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        Assert.IsType<ChallengeResult>(controller.Get(true));
    }

    private static StatusController ControllerFor(string name) => new()
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, name)], "Windows"))
            }
        }
    };
}
